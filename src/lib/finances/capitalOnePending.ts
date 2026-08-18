/**
 * Capital One's pending table, as a tagged TSV the dashboard pastes.
 *
 * SimpleFIN never reports these rows. The userscript copies what the bank page shows; this
 * module is the only place that turns that text into cents, a last-4, and a calendar day.
 * The script must not grow a second parser.
 *
 * Sign: the bank shows `$16.91` for a charge. The register stores card charges negative.
 * A payload that is already signed is left alone, so a later script that copies the
 * register convention does not get flipped twice.
 */

import { parseAmountCents } from "./money";

export const PLANNER_PENDING_HEADER = "# planner-pending v1";
export const SCRAPE_FEED = "scrape:capitalone";

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

export type ScrapedPendingRow = {
  dateKey: string;
  description: string;
  sourceCategory: string;
  /** Already in register convention: charges negative. */
  amountCents: number;
  externalId: string;
};

export type ScrapedPendingPayload = {
  last4: string;
  scrapedOn: string;
  rows: ScrapedPendingRow[];
  /**
   * Bank current balance, register sign. Present when the userscript could read it.
   * An empty pending table plus this figure is how we learn that pending posted — SimpleFIN
   * still reports yesterday's posted number for hours after Capital One shows none.
   */
  currentCents?: number;
};

export type ParsePendingResult =
  { ok: true; payload: ScrapedPendingPayload } | { ok: false; error: string };

export function looksLikePlannerPending(text: string): boolean {
  return firstMeaningfulLine(text) === PLANNER_PENDING_HEADER;
}

/**
 * Turn `Sun, Aug 16, 2026` (Cap One's drawer) or `2026-08-16` into a day key.
 *
 * Parts, not `new Date(that string)` — the latter is UTC-midnight on some engines and
 * rolls back a day in US timezones (`development/dates.md`).
 */
export function parsePurchasedDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const match = /^[A-Za-z]{3}, ([A-Za-z]{3}) (\d{1,2}), (\d{4})$/.exec(trimmed);
  if (!match) return null;
  const month = MONTHS[match[1].toLowerCase()];
  if (!month) return null;
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (!isRealDate(year, Number(month), day)) return null;
  return `${year}-${month}-${String(day).padStart(2, "0")}`;
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day, 12));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

export function parsePlannerPending(
  text: string,
  todayKey: string,
): ParsePendingResult {
  if (!looksLikePlannerPending(text)) {
    return { ok: false, error: "That is not a Planner pending paste." };
  }

  const lines = text.split(/\r?\n/);
  let last4: string | null = null;
  let scrapedOn: string | null = null;
  let currentCents: number | undefined;
  let columnLine: string | null = null;
  const dataLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed === PLANNER_PENDING_HEADER) continue;
    if (trimmed.startsWith("#")) {
      const meta = /^#\s*([a-zA-Z]+)\s*=\s*(.+)$/.exec(trimmed);
      if (!meta) continue;
      const key = meta[1].toLowerCase();
      const value = meta[2].trim();
      if (key === "account") last4 = value.replace(/\D/g, "").slice(-4);
      if (key === "scraped") scrapedOn = parsePurchasedDate(value);
      if (key === "current") {
        const shown = parseAmountCents(value);
        if (shown === null) {
          return { ok: false, error: "Could not read the current balance." };
        }
        // Same sign rule as the amount column: the bank shows `$439.46` owed.
        currentCents = shown > 0 ? -shown : shown;
      }
      continue;
    }
    if (columnLine === null) {
      columnLine = trimmed.toLowerCase();
      continue;
    }
    dataLines.push(line);
  }

  if (last4 === null || last4.length !== 4) {
    return { ok: false, error: "The paste needs an # account= last four." };
  }
  const fallbackDay = scrapedOn ?? todayKey;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fallbackDay)) {
    return {
      ok: false,
      error: "The paste needs a scrape date, or a today to fall back to.",
    };
  }

  const columns = (columnLine ?? "").split(/\t/).map((cell) => cell.trim());
  const dateIdx = columns.indexOf("date");
  const descIdx = columns.indexOf("description");
  const catIdx = columns.indexOf("category");
  const amountIdx = columns.indexOf("amount");
  if (descIdx < 0 || amountIdx < 0) {
    // A header-only or metadata-only paste is the empty-pending snapshot.
    if (dataLines.length === 0) {
      return {
        ok: true,
        payload: { last4, scrapedOn: fallbackDay, rows: [], currentCents },
      };
    }
    return { ok: false, error: "The paste needs description and amount columns." };
  }

  const parsed: Omit<ScrapedPendingRow, "externalId">[] = [];
  for (const line of dataLines) {
    const cells = line.split("\t");
    const description = (cells[descIdx] ?? "").trim();
    const amountRaw = (cells[amountIdx] ?? "").trim();
    if (description === "" && amountRaw === "") continue;
    if (description === "") {
      return { ok: false, error: "A pending row is missing its description." };
    }
    const shown = parseAmountCents(amountRaw);
    if (shown === null || shown === 0) {
      return { ok: false, error: `Could not read the amount for ${description}.` };
    }
    const dateRaw = dateIdx >= 0 ? (cells[dateIdx] ?? "").trim() : "";
    const dateKey = dateRaw === "" ? fallbackDay : parsePurchasedDate(dateRaw);
    if (dateKey === null) {
      return { ok: false, error: `Could not read the date for ${description}.` };
    }
    parsed.push({
      dateKey,
      description,
      sourceCategory: catIdx >= 0 ? (cells[catIdx] ?? "").trim() : "",
      amountCents: shown > 0 ? -shown : shown,
    });
  }

  // Zero rows is a real snapshot: the bank page said there are no pending transactions.
  // Refusing that paste is how leftover scrape-pending survived after everything posted.
  const seen = new Map<string, number>();
  const rows: ScrapedPendingRow[] = parsed.map((row) => {
    const stem = `${last4}|${fold(row.description)}|${Math.abs(row.amountCents)}`;
    const n = seen.get(stem) ?? 0;
    seen.set(stem, n + 1);
    return { ...row, externalId: `${stem}|${n}` };
  });

  return {
    ok: true,
    payload: { last4, scrapedOn: fallbackDay, rows, currentCents },
  };
}

function fold(description: string): string {
  return description.replace(/\s+/g, " ").trim().toUpperCase();
}

function firstMeaningfulLine(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed !== "") return trimmed;
  }
  return "";
}
