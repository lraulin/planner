import type { NodeState, NodeType } from "@/db/schema";

export const RESULT_AREA_STATE_REFUSAL = "Result Areas do not have a state";

export type StatefulNodeType = Exclude<NodeType, "result_area">;

/** Result Areas are enduring roles; only finite work participates in lifecycle state. */
export function supportsLifecycleState(type: NodeType): type is StatefulNodeType {
  return type !== "result_area";
}

/** The stored state for a newly-created or newly-converted node. */
export function initialStateForType(type: NodeType): NodeState | null {
  return supportsLifecycleState(type) ? "not_started" : null;
}

/** Rejects state mutation at the domain boundary, independently of the calling surface. */
export function assertSupportsLifecycleState(
  type: NodeType,
): asserts type is StatefulNodeType {
  if (!supportsLifecycleState(type)) throw new Error(`${RESULT_AREA_STATE_REFUSAL}.`);
}

/** Specific command refusal for a single Result Area or a plural selection containing one. */
export function lifecycleStateRefusal(types: readonly NodeType[]): string | null {
  if (!types.includes("result_area")) return null;
  return types.some(supportsLifecycleState)
    ? `${RESULT_AREA_STATE_REFUSAL}; remove them from the selection`
    : RESULT_AREA_STATE_REFUSAL;
}
