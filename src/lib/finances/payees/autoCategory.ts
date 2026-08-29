/**
 * YNAB-style payee auto-categorisation.
 *
 * A claim (`claimedBudgetCategoryId`) is a different, stronger fact — "this merchant belongs
 * to this envelope" — and is not computed here. This module answers only: given a mode, a
 * stored default, and the latest eligible Category choices, what should the default become,
 * and what Category should a new uncategorised row receive?
 *
 * Spec: `agent-os/specs/2026-08-24-1522-category-by-kind-and-history/` D7.
 */

export const AUTO_CATEGORY_MODES = ["learn", "fixed", "off"] as const;
export type AutoCategoryMode = (typeof AUTO_CATEGORY_MODES)[number];

export function isAutoCategoryMode(value: string): value is AutoCategoryMode {
  return (AUTO_CATEGORY_MODES as readonly string[]).includes(value);
}

/** Compact grid/drawer label for a payee's auto-category setting. */
export function autoCategorySummary(payee: {
  claim: { name: string } | null;
  autoCategoryMode: AutoCategoryMode;
  defaultCategoryName: string | null;
}): string {
  if (payee.claim) return `Claimed · ${payee.claim.name}`;
  if (payee.autoCategoryMode === "off") return "Do not auto-categorize";
  const name = payee.defaultCategoryName ?? "none yet";
  if (payee.autoCategoryMode === "fixed") return `Fixed · ${name}`;
  return `Learn · ${name}`;
}

export type CategoryChoice = { id: string; categoryId: string | null };

export type PayeeAutoCategory = {
  claimedBudgetCategoryId: string | null;
  defaultBudgetCategoryId: string | null;
  autoCategoryMode: AutoCategoryMode;
};

/**
 * Category for a new or currently uncategorised eligible row.
 *
 * Existing/manual Category is the caller's job — they must not call this when a Category
 * is already set. Claim beats learned/fixed default. `off` and a missing default both
 * leave the row uncategorised.
 *
 * `claimApplies: false` is how a **bill** envelope refuses a charge that is not its own
 * (`billClaimMatch.ts`): the claim stops applying and the row falls through to the payee's
 * learned or fixed default, or stays uncategorised so the backlog count can raise it.
 */
export function categoryForNewTransaction(
  payee: PayeeAutoCategory,
  options: { claimApplies?: boolean } = {},
): string | null {
  if (payee.claimedBudgetCategoryId && options.claimApplies !== false) {
    return payee.claimedBudgetCategoryId;
  }
  if (payee.autoCategoryMode === "off") return null;
  return payee.defaultBudgetCategoryId;
}

/**
 * Two-of-the-latest-three Category, ignoring uncategorised slots as votes.
 *
 * Nulls occupy a position so a stray uncategorised import cannot be skipped past, but they
 * never elect a winner.
 */
export function majorityOfLatestThree(
  latest: readonly CategoryChoice[],
): string | null {
  const counts = new Map<string, number>();
  for (const row of latest.slice(0, 3)) {
    if (!row.categoryId) continue;
    counts.set(row.categoryId, (counts.get(row.categoryId) ?? 0) + 1);
  }
  return [...counts].find(([, count]) => count >= 2)?.[0] ?? null;
}

/**
 * Whether this Category write should update the learned default.
 *
 * A first default waits until the payee has no remaining uncategorised eligible charges.
 * Filing $9.99 Apple Music by amount must not teach the Apple payee to categorise $14.99
 * App Store purchases. Once a default exists, 2-of-latest-3 still runs so a real change of
 * mind can replace it.
 *
 * Claimed / fixed / off payees never learn; `nextLearnedDefault` is a no-op for them too.
 */
export function shouldLearnFromCategoryEdit(
  payee: PayeeAutoCategory,
  latestEligible: readonly CategoryChoice[],
): boolean {
  if (payee.claimedBudgetCategoryId) return false;
  if (payee.autoCategoryMode !== "learn") return false;
  if (payee.defaultBudgetCategoryId) return true;
  return latestEligible.every((row) => row.categoryId !== null);
}

/**
 * The next learned default after an edit, or the current default when nothing should change.
 *
 * - First manual assignment (no current default, exactly one distinct Category among the
 *   latest three) learns immediately — once `shouldLearnFromCategoryEdit` has let it.
 * - A different Category on at least two of the latest three replaces the default.
 * - Edits outside that window are ignored.
 * - Claimed / fixed / off payees do not learn; the stored default is preserved.
 */
export function nextLearnedDefault(
  payee: PayeeAutoCategory,
  editedId: string,
  latestEligible: readonly CategoryChoice[],
): string | null {
  if (payee.claimedBudgetCategoryId) return payee.defaultBudgetCategoryId;
  if (payee.autoCategoryMode !== "learn") return payee.defaultBudgetCategoryId;

  const window = latestEligible.slice(0, 3);
  if (!window.some((row) => row.id === editedId)) {
    return payee.defaultBudgetCategoryId;
  }

  const majority = majorityOfLatestThree(window);
  if (majority) return majority;

  if (payee.defaultBudgetCategoryId) return payee.defaultBudgetCategoryId;

  const votes = [
    ...new Set(window.flatMap((row) => (row.categoryId ? [row.categoryId] : []))),
  ];
  return votes.length === 1 ? votes[0] : null;
}

/**
 * Default inferred from history for an unclaimed payee that has none yet.
 *
 * Two of the latest three wins. If the whole eligible history has exactly one categorised
 * row, that is the default. Mixed or empty histories stay unset.
 */
export function inferredDefault(
  latestEligible: readonly CategoryChoice[],
): string | null {
  const majority = majorityOfLatestThree(latestEligible);
  if (majority) return majority;
  const categorised = latestEligible.filter((row) => row.categoryId);
  if (categorised.length === 1) return categorised[0].categoryId;
  return null;
}

/**
 * An unseeded rule is convertible only when it is exactly "this payee → this Category".
 *
 * Anything else — regex, amount, flow, tags, extra conditions — cannot be reconstructed
 * from a payee default, so the cutover must abort and name it.
 */
export function isConvertiblePayeeCategoryRule(rule: {
  seededId: string | null;
  conditions: unknown;
  actions: unknown;
}): boolean {
  if (rule.seededId !== null) return false;
  if (!Array.isArray(rule.conditions) || rule.conditions.length !== 1) return false;
  if (!Array.isArray(rule.actions) || rule.actions.length !== 1) return false;
  const condition = rule.conditions[0];
  const action = rule.actions[0];
  if (!isRecord(condition) || !isRecord(action)) return false;
  return (
    condition.field === "payee" &&
    condition.op === "is" &&
    typeof condition.value === "string" &&
    condition.value !== "" &&
    action.op === "set" &&
    action.field === "category" &&
    typeof action.value === "string" &&
    action.value !== ""
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function convertiblePayeeId(conditions: unknown): string | null {
  if (!Array.isArray(conditions) || conditions.length !== 1) return null;
  const condition = conditions[0];
  if (!isRecord(condition)) return null;
  if (condition.field !== "payee" || condition.op !== "is") return null;
  return typeof condition.value === "string" ? condition.value : null;
}

export function convertibleCategoryId(actions: unknown): string | null {
  if (!Array.isArray(actions) || actions.length !== 1) return null;
  const action = actions[0];
  if (!isRecord(action)) return null;
  if (action.op !== "set" || action.field !== "category") return null;
  return typeof action.value === "string" ? action.value : null;
}
