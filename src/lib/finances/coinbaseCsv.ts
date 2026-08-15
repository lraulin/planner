import { parseCsvRows } from "@/lib/csv/text";
import { parseAmountCents } from "./money";
import type {
  ParsedAccount,
  ParsedFinanceCsv,
  ParsedTransaction,
  RowError,
} from "./types";

/**
 * Reading a Coinbase transaction-history CSV into the register.
 *
 * Coinbase is a real account (`kind: investment`) whose value here is **provenance**,
 * not net worth. Net BTC held on this history is 0.00000000 — every sat that arrived
 * was sold, sent, or traded away — so the account must not invent a household balance
 * out of historical USD. Crypto rows therefore carry `amountCents = 0` and keep the
 * signed quantity in the description; the only USD that lands on the ledger is the
 * cash that actually moved to Capital One.
 *
 * A withdrawal's `Subtotal` is what the bank received (`$482.03`). `Total` is what
 * left the platform (`$490.62`); the delta is Coinbase's fee. The checking deposit
 * matches Subtotal, so that is the amount we store, and the preceding Sell is given
 * the same magnitude as an `external_transfer` so pairing the two legs as an
 * internal transfer does not delete the liquidation from cash flow.
 *
 * Buys and Sends stay `external_transfer` in spirit (PenFed funded the buys and is
 * unimported; Sends left for wallets we do not hold) but they carry no USD, so they
 * do not move `net` or the residual. The comment in `transfers.ts` records the same
 * reasoning for the wording on the withdrawal / checking pair.
 *
 * The header is on line 4. Lines 1–3 are a blank, `Transactions`, and `User,…`.
 */

export type ParseFailure = { ok: false; error: string };
export type ParseSuccess = { ok: true; parsed: ParsedFinanceCsv };

const HEADER_MARKERS = ["transactiontype", "quantitytransacted", "subtotal"] as const;

function normalizeHeader(cell: string): string {
  return cell
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Cheap enough to run on every upload; specific enough not to claim a bank CSV. */
export function looksLikeCoinbaseCsv(text: string): boolean {
  const rows = parseCsvRows(text);
  return rows.some((row) => {
    const present = new Set(row.map(normalizeHeader));
    return HEADER_MARKERS.every((marker) => present.has(marker));
  });
}

function headerIndex(cells: readonly string[]): Map<string, number> {
  const index = new Map<string, number>();
  cells.forEach((cell, i) => {
    const key = normalizeHeader(cell);
    if (!index.has(key)) index.set(key, i);
  });
  return index;
}

function cell(cells: readonly string[], index: number | undefined): string {
  if (index === undefined) return "";
  return (cells[index] ?? "").trim();
}

/** `2026-02-03 18:47:29 UTC` → `2026-02-03`. The calendar day Coinbase wrote, not local. */
function dateFromTimestamp(raw: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})\b/.exec(raw.trim());
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

const SATS_PER_BTC = BigInt(100_000_000);

/**
 * Signed satoshis from a Coinbase description (`Coinbase Sell -0.02126381 BTC`).
 * Integer on purpose: summing the 90 BTC rows as floats reports `-0.00000000`.
 */
export function btcSatsFromDescription(description: string): bigint {
  const match = /(-?\d+(?:\.\d+)?)\s+BTC\b/i.exec(description);
  if (!match) return BigInt(0);
  const raw = match[1];
  const negative = raw.startsWith("-");
  const digits = raw.replace(/^[+-]/, "");
  const [whole, fraction = ""] = digits.split(".");
  const frac = (fraction + "00000000").slice(0, 8);
  const sats = BigInt(whole || "0") * SATS_PER_BTC + BigInt(frac);
  return negative ? -sats : sats;
}

export function formatBtcFromSats(sats: bigint): string {
  const negative = sats < BigInt(0);
  const magnitude = negative ? -sats : sats;
  const whole = magnitude / SATS_PER_BTC;
  const frac = (magnitude % SATS_PER_BTC).toString().padStart(8, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${frac}`;
}

type Draft = {
  transaction: ParsedTransaction;
  type: string;
  used: boolean;
};

function describe(
  type: string,
  quantity: string,
  asset: string,
  notes: string,
): string {
  const qty = quantity.trim();
  const unit = asset.trim() || "USD";
  const head = `Coinbase ${type} ${qty} ${unit}`.replace(/\s+/g, " ").trim();
  // Withdrawals name the bank in Notes; keep the last four visible for pairing
  // even when Coinbase truncated the account name (`360 Chec... ****2322`).
  if (/withdrawal/i.test(type)) {
    const key = /\*{2,}(\d{4})/.exec(notes);
    if (key) return `${head} to Capital One XXXX${key[1]}`;
  }
  return head;
}

/**
 * Parse one Coinbase history export. Returns `[]` accounts when the file is not
 * Coinbase, rather than throwing — the importer tries each parser in turn.
 */
export function parseCoinbaseCsv(
  fileName: string,
  text: string,
): ParseSuccess | ParseFailure {
  if (text.trim() === "") {
    return { ok: false, error: `"${fileName}" is empty.` };
  }
  const rows = parseCsvRows(text);
  const headerAt = rows.findIndex((row) => {
    const present = new Set(row.map(normalizeHeader));
    return HEADER_MARKERS.every((marker) => present.has(marker));
  });
  if (headerAt === -1) {
    return {
      ok: false,
      error: `"${fileName}" is not a Coinbase transaction history.`,
    };
  }

  const userRow = rows.find((row) => row[0]?.trim() === "User");
  const externalKey = userRow?.[2]?.trim() || "coinbase";

  const index = headerIndex(rows[headerAt]);
  const errors: RowError[] = [];
  const drafts: Draft[] = [];

  for (let i = headerAt + 1; i < rows.length; i++) {
    const cells = rows[i];
    if (cells.every((value) => value.trim() === "")) continue;
    const rowNumber = i + 1;
    const timestamp = cell(cells, index.get("timestamp"));
    const transactionDate = dateFromTimestamp(timestamp);
    if (!transactionDate) {
      errors.push({
        row: rowNumber,
        message: `Unreadable timestamp "${timestamp}".`,
      });
      continue;
    }
    const type = cell(cells, index.get("transactiontype"));
    const asset = cell(cells, index.get("asset"));
    const quantity = cell(cells, index.get("quantitytransacted"));
    const notes = cell(cells, index.get("notes"));
    const id = cell(cells, index.get("id"));
    if (!id) {
      errors.push({ row: rowNumber, message: "Row has no Coinbase id." });
      continue;
    }

    let amountCents = 0;
    if (/^withdrawal$/i.test(type)) {
      const subtotal = parseAmountCents(cell(cells, index.get("subtotal")));
      if (subtotal === null) {
        errors.push({
          row: rowNumber,
          message: `Unreadable Subtotal "${cell(cells, index.get("subtotal"))}".`,
        });
        continue;
      }
      // Subtotal is the net to the bank, always written positive. Money is leaving.
      amountCents = -Math.abs(subtotal);
    }

    drafts.push({
      type,
      used: false,
      transaction: {
        transactionDate,
        postedDate: transactionDate,
        description: describe(type, quantity, asset, notes),
        amountCents,
        sourceCategory: type,
        memo: notes,
        balanceAfterCents: null,
        externalId: id,
      },
    });
  }

  // A Sell minutes before a Withdrawal is the same liquidation. The export is
  // newest-first, so the Sell is the next row, not the previous one. Same
  // calendar day is the signal — every real pair posted together.
  for (const draft of drafts) {
    if (!/^withdrawal$/i.test(draft.type)) continue;
    const sell = drafts.find(
      (candidate) =>
        !candidate.used &&
        /^sell$/i.test(candidate.type) &&
        candidate.transaction.transactionDate === draft.transaction.transactionDate,
    );
    if (!sell) continue;
    sell.transaction.amountCents = -draft.transaction.amountCents;
    sell.used = true;
    draft.used = true;
  }

  const account: ParsedAccount = {
    externalKey,
    name: "Coinbase",
    institution: "Coinbase",
    kind: "investment",
    transactions: drafts.map((draft) => draft.transaction),
  };

  return {
    ok: true,
    parsed: { feed: "csv:coinbase", accounts: [account], statements: [], errors },
  };
}
