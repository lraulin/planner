"use client";

import { useCallback } from "react";
import { attachUrlsToNodeAction } from "@/app/plan/outline/detail-actions";
import { useToast } from "@/components/shell/ToastProvider";
import type { ActionResult } from "@/components/grid/useOptimisticNodes";
import {
  CLIPBOARD_UNREADABLE,
  clipboardAttachRefusal,
} from "@/lib/url/clipboardAttach";

/**
 * Read the clipboard, then attach its URLs to a project or task.
 *
 * The browser will not hand over clipboard text until this click, so enablement lives on
 * the row (project / task) and failures after the click are an error toast.
 */
export function useAttachFromClipboard(
  apply: (action: () => Promise<ActionResult>) => void,
): {
  attachFromClipboard: (id: string) => void;
} {
  const toast = useToast();
  const fail = useCallback(
    (message: string) => toast.error("Could not add attachment", { body: message }),
    [toast],
  );

  const attachFromClipboard = useCallback(
    (id: string) => {
      void (async () => {
        let text: string;
        try {
          if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
            fail(CLIPBOARD_UNREADABLE);
            return;
          }
          text = await navigator.clipboard.readText();
        } catch {
          fail(CLIPBOARD_UNREADABLE);
          return;
        }
        const refusal = clipboardAttachRefusal(text);
        if (refusal) {
          fail(refusal);
          return;
        }
        apply(() => attachUrlsToNodeAction(id, text));
      })();
    },
    [apply, fail],
  );

  return { attachFromClipboard };
}
