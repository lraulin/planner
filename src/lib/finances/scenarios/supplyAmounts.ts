import { supplyGroups, supplyItemRows } from "../supplies/rows";
import type { SupplyItemRow } from "../supplies/queries";
import type { SupplyAmounts } from "./amount";

/**
 * The monthly figures Supplies reports right now, keyed for a scenario line to look up.
 *
 * A group's figure is `supplyGroups`' own subtotal — the sum of the displayed item rows —
 * so a line following a group reads exactly what the Supplies page shows for it, and an item
 * added to the group afterwards is in the next read with nothing re-typed.
 */
export function supplyAmounts(items: readonly SupplyItemRow[]): SupplyAmounts {
  const itemMonthlyCents = new Map<string, number>();
  for (const item of items) {
    const [head] = supplyItemRows(item);
    itemMonthlyCents.set(
      item.id,
      head && head.kind === "item" ? (head.totals?.monthlyCents ?? 0) : 0,
    );
  }

  const idByLabel = new Map<string, string>();
  for (const item of items) {
    if (item.groupId !== null) idByLabel.set(item.groupLabel, item.groupId);
  }
  const groupMonthlyCents = new Map<string, number>();
  for (const group of supplyGroups(items)) {
    const id = idByLabel.get(group.label);
    if (id !== undefined) groupMonthlyCents.set(id, group.totals.monthlyCents);
  }

  return { itemMonthlyCents, groupMonthlyCents };
}
