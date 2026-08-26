import { describe, expect, it } from "vitest";
import { cityStateMergeProposals, type AliasEntry } from "./cityState";

let next = 0;
function entry(alias: string, payeeName = alias, transactionCount = 1): AliasEntry {
  next += 1;
  return { alias, payeeId: `p${next}`, payeeName, transactionCount };
}

function merges(aliases: readonly AliasEntry[]): string[] {
  return cityStateMergeProposals(aliases).map(
    (proposal) => `${proposal.source.alias} → ${proposal.target.alias}`,
  );
}

describe("cityStateMergeProposals", () => {
  it("proposes a merge when a town and state were run onto a known merchant", () => {
    expect(merges([entry("WAWA 592CALIFORNIAMD"), entry("WAWA")])).toEqual([
      "WAWA 592CALIFORNIAMD → WAWA",
    ]);
  });

  it("reports the whole run-on, not its tail", () => {
    const [proposal] = cityStateMergeProposals([
      entry("SAFEWAY 1731PRINCE FREDERMD"),
      entry("SAFEWAY"),
    ]);
    expect(proposal.glued).toBe("PRINCE FREDERMD");
  });

  it("sees through a store number and a dangling asterisk", () => {
    expect(merges([entry("LOWES #00719*CALIFORNIAMD"), entry("LOWES")])).toEqual([
      "LOWES #00719*CALIFORNIAMD → LOWES",
    ]);
  });

  it("handles a town glued to a name that ends in a letter", () => {
    expect(merges([entry("STEAM GAMESSAN JOSEWA"), entry("STEAM GAMES")])).toEqual([
      "STEAM GAMESSAN JOSEWA → STEAM GAMES",
    ]);
  });

  // The three hazards a prefix sweep produced against the real export. Each stays a non-merge.
  it("never collapses AMAZON PRIME into AMAZON", () => {
    expect(merges([entry("AMAZON PRIME"), entry("AMAZON")])).toEqual([]);
  });

  it("never folds GRAY MIRROR into the damaged fragment GRAY", () => {
    expect(merges([entry("GRAY MIRROR"), entry("GRAY")])).toEqual([]);
  });

  it("never treats DIRECT as a town", () => {
    expect(merges([entry("PLAYSTATION DIRECT"), entry("PLAYSTATION")])).toEqual([]);
  });

  it("never truncates EVERGREEN DISPOSAL on its AL", () => {
    expect(merges([entry("EVERGREEN DISPOSAL"), entry("EVERGREEN")])).toEqual([]);
  });

  it("leaves a state spelled as its own word alone", () => {
    expect(merges([entry("WAWA MD"), entry("WAWA")])).toEqual([]);
  });

  it("proposes nothing when the ledger has never seen the base merchant", () => {
    expect(merges([entry("KIMS NAILS IIICALIFORNIAMD")])).toEqual([]);
  });

  it("does not propose merging a payee into itself", () => {
    const shared = entry("WAWA");
    const glued: AliasEntry = {
      alias: "WAWA 592CALIFORNIAMD",
      payeeId: shared.payeeId,
      payeeName: shared.payeeName,
      transactionCount: 4,
    };
    expect(merges([glued, shared])).toEqual([]);
  });

  it("puts the biggest repair first", () => {
    expect(
      merges([
        entry("WAWA 592CALIFORNIAMD", "WAWA 592CALIFORNIAMD", 2),
        entry("WAWA"),
        entry("SAFEWAY 1731PRINCE FREDERMD", "SAFEWAY 1731PRINCE FREDERMD", 9),
        entry("SAFEWAY"),
      ]),
    ).toEqual(["SAFEWAY 1731PRINCE FREDERMD → SAFEWAY", "WAWA 592CALIFORNIAMD → WAWA"]);
  });
});
