/**
 * Payees the bank glued a city and state onto — proposed, never swept.
 *
 * Fixed-width statement fields run the store's town and state straight into the merchant:
 * `WAWA 592CALIFORNIAMD`, `SAFEWAY 1731PRINCE FREDERMD`, `STEAM GAMESSAN JOSEWA`. Each one
 * becomes a payee of its own, so the same shop is counted three times.
 *
 * **A prefix sweep is provably unsafe.** Run against the real 7,322-row export it merged
 * `AMAZON PRIME → AMAZON` — collapsing a subscription into discretionary spending, the exact
 * distinction the budget exists to make — and `GRAY MIRROR → GRAY`, folding a correct name
 * into a damaged fragment. A naive trailing-state strip also truncates `EVERGREEN DISPOSAL`
 * on its "AL". All three are pinned in the tests.
 *
 * So this proposes nothing on its own evidence. A candidate survives only when
 *
 *  1. the alias ends in a state code **glued** to a letter, not preceded by a space;
 *  2. removing a run of ≥3 letters (the town) leaves a base that does **not** end in a
 *     space — a space means the words were separate all along, which is what `AMAZON PRIME`
 *     and `GRAY MIRROR` are; and
 *  3. that base normalizes to an alias **another payee already holds**. The proposal points
 *     at a merchant the ledger has actually seen, not at a string this module invented.
 *
 * Spec: `agent-os/specs/2026-08-25-2144-payee-evidence-and-merge/` D6.
 */

import { normalizeMerchant } from "../classify/merchant";

/** USPS codes, including the territories the feeds use. */
const STATE_CODES = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "DC",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "PR",
  "VI",
  "GU",
  "AS",
  "MP",
]);

/** The shortest town a bank field is worth trusting. Below this the match is coincidence. */
const MIN_TOWN = 3;

/** The shortest merchant name worth pointing a merge at. */
const MIN_NAME = 3;

export type AliasEntry = {
  alias: string;
  payeeId: string;
  payeeName: string;
  /** Charges carrying this alias — the size of what a confirmed merge would move. */
  transactionCount: number;
};

export type CityStateProposal = {
  source: AliasEntry;
  target: AliasEntry;
  /** The town and state the bank ran onto the name, for the reader to check. */
  glued: string;
};

/**
 * Every alias that looks like `<known merchant><town><state>`, with the merchant it matches.
 *
 * Deterministic and read-only: a plan, in the shape the payee-matcher cutover established.
 * Nothing here writes, and the audit that prints it has no `--apply`.
 */
export function cityStateMergeProposals(
  aliases: readonly AliasEntry[],
): CityStateProposal[] {
  const byAlias = new Map(aliases.map((entry) => [entry.alias, entry]));
  const proposals: CityStateProposal[] = [];

  for (const entry of aliases) {
    const found = proposalFor(entry, byAlias);
    if (found) proposals.push(found);
  }

  return proposals.sort(
    (a, b) =>
      b.source.transactionCount - a.source.transactionCount ||
      a.source.alias.localeCompare(b.source.alias),
  );
}

function proposalFor(
  entry: AliasEntry,
  byAlias: ReadonlyMap<string, AliasEntry>,
): CityStateProposal | null {
  const alias = entry.alias;
  const state = alias.slice(-2);
  if (!STATE_CODES.has(state)) return null;
  // Glued, not spelled out as its own word: `WAWA MD` is a name, `WAWAMD` is a field run-on.
  if (!/[A-Z]/.test(alias.slice(-3, -2))) return null;

  const core = alias.slice(0, -2);

  // Longest town first, so the reported `glued` is the whole run-on rather than its tail.
  for (let cut = 1; cut <= core.length - MIN_TOWN; cut += 1) {
    const town = core.slice(cut);
    if (!/^[A-Z][A-Z ]*$/.test(town)) continue;

    const base = core.slice(0, cut);
    // A space here means the two words were always separate — `AMAZON` + ` PRIME`.
    if (base.endsWith(" ")) continue;

    const target = byAlias.get(normalizeMerchant(base));
    if (!target) continue;
    if (target.alias === alias || target.payeeId === entry.payeeId) continue;
    if (target.alias.length < MIN_NAME) continue;

    return { source: entry, target, glued: town + state };
  }

  return null;
}
