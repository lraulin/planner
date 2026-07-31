"use client";

import { requestQuickCapture } from "@/components/capture/event";
import { CaptureIcon } from "./navIcons";

/**
 * The bottom nav's centre slot. Fires the same `CAPTURE_EVENT` as the desktop capture button
 * rather than owning any state of its own — see `capture/event.ts` for why that is an event
 * and not context.
 *
 * Capture is the fastest path into the app and the reason to have it on a phone at all, so it
 * gets the middle slot and the only filled treatment in the bar.
 */
export function CaptureNavButton() {
  return (
    <button
      type="button"
      onClick={requestQuickCapture}
      aria-label="Quick capture"
      className="flex min-h-tap flex-1 items-center justify-center py-1.5"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-select-edge text-surface">
        <CaptureIcon />
      </span>
    </button>
  );
}
