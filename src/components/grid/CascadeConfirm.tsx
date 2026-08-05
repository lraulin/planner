"use client";

import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import type { useStateChange } from "./useStateChange";

/**
 * The "this will settle N open items too" prompt, so each host renders it in one line
 * instead of restating the same six props.
 *
 * Not destructive-styled: completing work is the good outcome, and painting the confirm red
 * would make the app's happiest path look like a warning. It asks because the cascade is
 * hard to reverse, not because it is dangerous.
 */
export function CascadeConfirm({
  state,
}: {
  state: ReturnType<typeof useStateChange>;
}) {
  if (!state.prompt) return null;

  return (
    <ConfirmDialog
      open
      title={state.prompt.title}
      message={state.prompt.message}
      confirmLabel={state.prompt.confirmLabel}
      onConfirm={state.confirm}
      onCancel={state.cancel}
    />
  );
}
