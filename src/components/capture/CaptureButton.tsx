"use client";

import { requestQuickCapture } from "./event";

/**
 * The visible way in, so the shortcut is discoverable rather than folklore —
 * `ux-principles.md`: "a gesture nobody can see is not a discoverable action."
 */
export function CaptureButton() {
  return (
    <button
      type="button"
      onClick={requestQuickCapture}
      title="Quick capture (c)"
      className="rounded border border-rule px-2 py-1 text-[0.8125rem] leading-none text-ink-muted transition-colors hover:border-rule-strong hover:bg-surface-raised hover:text-ink"
    >
      + Capture
    </button>
  );
}
