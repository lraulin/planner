"use client";

import { useCallback, useState, type ReactNode } from "react";
import { attachUrlsToNodeAction } from "@/app/plan/outline/detail-actions";
import { NoticeDialog } from "@/components/detail/NoticeDialog";
import type { ActionResult } from "@/components/grid/useOptimisticNodes";
import { clipboardAttachRefusal } from "@/lib/url/clipboardAttach";

/**
 * Read the clipboard, then attach its URLs to a project or task.
 *
 * The browser will not hand over clipboard text until this click, so enablement lives on
 * the row (project / task) and failures after the click are a one-button notice.
 */
export function useAttachFromClipboard(
  apply: (action: () => Promise<ActionResult>) => void,
): {
  attachFromClipboard: (id: string) => void;
  noticeDialog: ReactNode;
} {
  const [notice, setNotice] = useState<string | null>(null);

  const attachFromClipboard = useCallback(
    (id: string) => {
      void (async () => {
        let text: string;
        try {
          if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
            setNotice("Could not read the clipboard.");
            return;
          }
          text = await navigator.clipboard.readText();
        } catch {
          setNotice("Could not read the clipboard.");
          return;
        }
        const refusal = clipboardAttachRefusal(text);
        if (refusal) {
          setNotice(refusal);
          return;
        }
        apply(() => attachUrlsToNodeAction(id, text));
      })();
    },
    [apply],
  );

  return {
    attachFromClipboard,
    noticeDialog: (
      <NoticeDialog
        open={notice !== null}
        title="Could not add attachment"
        message={notice ?? ""}
        onClose={() => setNotice(null)}
      />
    ),
  };
}
