import type { NodeState } from "@/db/schema";

/**
 * What else changes when one node's state changes.
 *
 * A parent's state is a claim about the work beneath it, so the two cannot disagree:
 *
 * - **Settling a node settles the open work under it.** Ticking off a project when three of
 *   its tasks are still open would leave the outline asserting both that the project is done
 *   and that it is not.
 * - **Starting or finishing a node starts the not-started nodes above it**, as `in_progress`.
 *   Work under a project has begun (or is already done); leaving the project Not started
 *   would claim otherwise. Achieve does this on complete; we also do it on In progress,
 *   because that is the same claim one step earlier.
 * - **Un-settling a node re-opens the settled nodes above it**, as `in_progress` rather than
 *   `not_started` — something under it *has* been done, which is exactly the state that
 *   describes.
 * - **Un-settling does not cascade downward.** Re-opening a project must not undo twenty
 *   tasks that really were finished. The asymmetry is deliberate, and it is why the UI
 *   confirms a settle that would take open work with it: that direction is the one you
 *   cannot get back by reversing the gesture.
 *
 * Achieve reopens a completed parent when a child goes *cancelled*, but does not complete a
 * cancelled child when the parent completes. We treat **completed and cancelled as
 * interchangeably settled** instead — both mean the work is not coming back, and one rule is
 * easier to hold than two that disagree at the edges. Cancelling also does not start a
 * not-started parent: the work is not happening, so the parent has not begun.
 *
 * Pure, because this is the reasoning worth testing: the database walk around it is
 * bookkeeping, and a wrong answer here looks entirely plausible on screen.
 */

export type CascadeNode = {
  id: string;
  parentId: string | null;
  state: NodeState | null;
};

export type StateChange = { id: string; state: NodeState };

/** Completed and cancelled both mean settled: the work is not coming back. */
export function isSettled(state: NodeState | null): boolean {
  return state === "completed" || state === "cancelled";
}

/**
 * The state every *other* node takes when `nodeId` becomes `next`. Never includes `nodeId`
 * itself — the caller is already applying that one, and returning it twice invites a double
 * write with two different code paths deciding what it means.
 *
 * `next` is the state the node **ended up in**, which is what the downward settle and the
 * reopen walk must read. `requested` is what was asked for, and only matters for starting
 * not-started ancestors: completing a repeating task never lands on `completed` (it shelves
 * until next time) but work did happen, so the parents still have to start.
 */
export function cascadeStateChange(
  all: readonly CascadeNode[],
  nodeId: string,
  next: NodeState,
  requested: NodeState = next,
): StateChange[] {
  const out = isSettled(next)
    ? settleDescendants(all, nodeId, next)
    : reopenAncestors(all, nodeId);
  if (impliesWorkStarted(next) || requested === "completed") {
    out.push(...startNotStartedAncestors(all, nodeId));
  }
  return out;
}

/** Completed or in progress: work under this node has begun, or is already done. */
function impliesWorkStarted(state: NodeState): boolean {
  return state === "completed" || state === "in_progress";
}

/**
 * How many open descendants a settle would take with it.
 *
 * The number the confirmation names. Zero is the common case — a leaf task, or a project
 * whose work is already done — and the case that must not ask.
 */
export function openDescendantCount(
  all: readonly CascadeNode[],
  nodeId: string,
  next: NodeState,
): number {
  return isSettled(next) ? settleDescendants(all, nodeId, next).length : 0;
}

/**
 * Open descendants take the settling state. Already-settled ones keep theirs, so completing
 * a project does not rewrite a task somebody deliberately cancelled, and cancelling one does
 * not erase work that was actually finished.
 */
function settleDescendants(
  all: readonly CascadeNode[],
  nodeId: string,
  next: NodeState,
): StateChange[] {
  const childrenOf = new Map<string, CascadeNode[]>();
  for (const node of all) {
    if (node.parentId === null) continue;
    const siblings = childrenOf.get(node.parentId);
    if (siblings) siblings.push(node);
    else childrenOf.set(node.parentId, [node]);
  }

  const out: StateChange[] = [];
  const queue = [...(childrenOf.get(nodeId) ?? [])];

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) continue;
    // Descend through a settled node anyway: it may sit above open work, and leaving that
    // work open under a settled parent is the state this whole rule exists to prevent.
    if (node.state !== null && !isSettled(node.state)) {
      out.push({ id: node.id, state: next });
    }
    queue.push(...(childrenOf.get(node.id) ?? []));
  }

  return out;
}

/**
 * Settled ancestors reopen as `in_progress`.
 *
 * Walks the whole chain rather than stopping at the first open one: a grandparent can be
 * completed while the parent between them is not, and leaving it settled would put an open
 * task under a completed goal — the same contradiction one level up.
 */
function reopenAncestors(all: readonly CascadeNode[], nodeId: string): StateChange[] {
  return walkAncestors(all, nodeId, (parent) =>
    parent.state !== null && isSettled(parent.state) ? "in_progress" : null,
  );
}

/**
 * Not-started ancestors become `in_progress`. Waiting, postponed, delegated and the rest
 * stay put — those are deliberate, and starting work underneath does not unshelve a parent
 * or un-wait one.
 *
 * Walks the whole chain: a not-started grandparent above an already-started parent is still
 * claiming nothing has begun.
 */
function startNotStartedAncestors(
  all: readonly CascadeNode[],
  nodeId: string,
): StateChange[] {
  return walkAncestors(all, nodeId, (parent) =>
    parent.state === "not_started" ? "in_progress" : null,
  );
}

function walkAncestors(
  all: readonly CascadeNode[],
  nodeId: string,
  nextState: (parent: CascadeNode) => NodeState | null,
): StateChange[] {
  const byId = new Map(all.map((node) => [node.id, node]));
  const out: StateChange[] = [];

  let parentId = byId.get(nodeId)?.parentId ?? null;
  const seen = new Set<string>([nodeId]);

  while (parentId !== null && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    const state = nextState(parent);
    if (state !== null) out.push({ id: parent.id, state });
    parentId = parent.parentId;
  }

  return out;
}
