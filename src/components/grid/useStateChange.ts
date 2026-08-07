"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { ActionResult } from "@/app/actionResult";
import type { NodeState } from "@/db/schema";
import type { OutlineNode } from "@/lib/tree/types";
import { cascadeStateChange, openDescendantCount } from "@/lib/tree/completionCascade";
import { STATE_LABELS } from "@/lib/tree/hierarchy";

/**
 * Changing a row's state, with the branch kept consistent around it.
 *
 * Settling a node settles the open work under it and re-opening one re-opens the settled
 * nodes above it — the rule and its reasoning live in `lib/tree/completionCascade`. The
 * server does the same walk in one transaction; this repeats it locally so the other rows
 * change on the same frame rather than a round trip later.
 *
 * **It asks first only when it would settle open work.** Settling is the one direction you
 * cannot undo by reversing the gesture: re-opening a project deliberately does not re-open
 * the twenty tasks that really were finished, so a mis-click would leave you fixing them by
 * hand. Completing a leaf task, or a project whose work is already done, changes nothing
 * else and goes straight through — which is the overwhelming majority of completions, and
 * why this is not the confirm-on-every-tick that Achieve ships.
 */

/** The server action for one node's state, as the hosts already have it bound. */
export type StateAction = (nodeId: string, state: NodeState) => Promise<ActionResult>;

export type PendingStateChange = {
  node: OutlineNode;
  state: NodeState;
  /** How many open descendants would be settled. Always > 0 while this is pending. */
  count: number;
};

export function useStateChange({
  nodes,
  patch,
  apply,
}: {
  nodes: OutlineNode[];
  patch: (id: string, changes: Partial<OutlineNode>) => void;
  apply: (run: () => Promise<ActionResult>) => void;
}) {
  const [pending, setPending] = useState<PendingStateChange | null>(null);
  /**
   * The action the parked change will run. A ref rather than state because it is a function
   * identity, not something the UI renders — and rather than a module-level variable, which
   * two mounted grids would share.
   */
  const pendingAction = useRef<StateAction | null>(null);

  const commit = useCallback(
    (node: OutlineNode, state: NodeState, action: StateAction) => {
      patch(node.id, { state });
      for (const change of cascadeStateChange(nodes, node.id, state)) {
        patch(change.id, { state: change.state });
      }
      // One call: the server runs the same cascade inside a transaction, so a branch is
      // never left half-settled by a failure between two requests.
      apply(() => action(node.id, state));
    },
    [nodes, patch, apply],
  );

  /**
   * Ask for a state change. Applies it immediately unless it would settle open descendants,
   * in which case it parks until `confirm`.
   */
  const request = useCallback(
    (node: OutlineNode, state: NodeState, action: StateAction) => {
      const count = openDescendantCount(nodes, node.id, state);
      if (count === 0) {
        commit(node, state, action);
        return;
      }
      pendingAction.current = action;
      setPending({ node, state, count });
    },
    [nodes, commit],
  );

  const confirm = useCallback(() => {
    const action = pendingAction.current;
    if (!pending || !action) return;
    pendingAction.current = null;
    setPending(null);
    commit(pending.node, pending.state, action);
  }, [pending, commit]);

  const cancel = useCallback(() => {
    pendingAction.current = null;
    setPending(null);
  }, []);

  /*
   * Memoised, because this object's identity is now load-bearing.
   *
   * It used to feed only `cellHandlers`, which nothing downstream compared — so returning a
   * fresh literal every render cost a little churn and showed as nothing. Then `Complete` and
   * the `State ▸` family started reading it, and a command list rebuilt every render
   * re-registers every render: `useRegisterCommands`' churn guard fired and React hit
   * "Maximum update depth exceeded".
   */
  return useMemo(
    () => ({ pending, request, confirm, cancel, prompt: promptFor(pending) }),
    [pending, request, confirm, cancel],
  );
}

/** What the confirmation says. Null when nothing is pending. */
function promptFor(pending: PendingStateChange | null) {
  if (!pending) return null;
  const verb = pending.state === "cancelled" ? "Cancel" : "Complete";
  const label = STATE_LABELS[pending.state];
  const name = pending.node.name || "this item";
  return {
    title: `${verb} “${name}” and what is under it?`,
    message:
      pending.count === 1
        ? `1 open item underneath will also be marked ${label}. Re-opening this one later will not re-open it.`
        : `${pending.count} open items underneath will also be marked ${label}. Re-opening this one later will not re-open them.`,
    confirmLabel: `${verb} all`,
  };
}
