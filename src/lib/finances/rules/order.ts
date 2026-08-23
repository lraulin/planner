import type { DropZone } from "@/lib/tree/dnd";

export type RulePosition = { afterId: string | null; beforeId: string | null };

export function nudgeRulePosition(
  orderedIds: readonly string[],
  ruleId: string,
  direction: -1 | 1,
): RulePosition | null {
  const at = orderedIds.indexOf(ruleId);
  const target = at + direction;
  if (at < 0 || target < 0 || target >= orderedIds.length) return null;
  const without = orderedIds.filter((id) => id !== ruleId);
  const insertion = direction < 0 ? target : target;
  return {
    afterId: without[insertion - 1] ?? null,
    beforeId: without[insertion] ?? null,
  };
}

export function droppedRulePosition(
  orderedIds: readonly string[],
  ruleId: string,
  targetId: string,
  zone: DropZone,
): RulePosition | null {
  if (zone === "inside" || ruleId === targetId) return null;
  const without = orderedIds.filter((id) => id !== ruleId);
  const target = without.indexOf(targetId);
  if (target < 0) return null;
  const insertion = zone === "before" ? target : target + 1;
  return {
    afterId: without[insertion - 1] ?? null,
    beforeId: without[insertion] ?? null,
  };
}
