"use client";

import { CaptureIcon } from "@/components/shell/navIcons";
import { requestQuickCapture } from "./event";

/**
 * The visible way in, so the shortcut is discoverable rather than folklore —
 * `ux-principles.md`: "a gesture nobody can see is not a discoverable action."
 *
 * `compact` is the collapsed sidebar rail: the glyph alone, with the label in `title`. It
 * keeps the same button rather than getting its own component, because two capture buttons
 * are two things that can disagree about what capture is called.
 */
export function CaptureButton({ compact = false }: { compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={requestQuickCapture}
      title="Quick capture (c)"
      aria-label={compact ? "Quick capture" : undefined}
      className={`flex items-center justify-center rounded border border-rule text-[0.8125rem] leading-none text-ink-muted transition-colors hover:border-rule-strong hover:bg-surface-raised hover:text-ink ${
        compact ? "h-7 w-full" : "px-2 py-1"
      }`}
    >
      {compact ? <CaptureIcon /> : "+ Capture"}
    </button>
  );
}
