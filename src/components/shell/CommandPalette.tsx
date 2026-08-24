"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { isModalOpen, isTypingTarget } from "@/lib/keyboard";
import { matchBindings } from "@/lib/commands/bindings";
import { OPEN_PALETTE } from "@/lib/commands/chords";
import { COMMAND_PALETTE_EVENT } from "./commandEvent";

const CommandPaletteDialog = dynamic(
  () =>
    import("./CommandPaletteDialog").then((mod) => ({
      default: mod.CommandPaletteDialog,
    })),
  { ssr: false },
);

/**
 * `⌘K` — the Go menu, and the index of everything the app can do.
 *
 * Achieve reached all sixteen of its destinations through **Go** and kept only what you had
 * opened as tabs. We had the tabs without the Go menu, which is why eleven of them were
 * permanent. This is the missing half, and it also swallows the Actions / Tools / View menus:
 * one registry, listed here and rendered again behind each module's `⋯` (`registry.ts`).
 *
 * Built on `ModalShell` per `modal-pattern.md`, so it gets the roles, capture-phase Escape,
 * and focus handling for free. There is no palette below `md` (`responsive.md`): `⋯` is the
 * phone's menu, and the More sheet is destinations only — it has no Search row.
 *
 * Unmounted rather than hidden while closed, per the same standard: the query is a draft,
 * and the next `⌘K` should start empty rather than showing the last thing you searched for.
 * The dialog itself is a separate chunk so every signed-in page does not parse it on load.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!matchBindings(event, OPEN_PALETTE)) return;
      // The same two guards `QuickCapture` uses: never steal a keystroke from something the
      // user is typing into, and never open on top of a drawer or a confirmation.
      if (isTypingTarget(event.target) || isModalOpen()) return;

      event.preventDefault();
      setOpen(true);
    }

    function onRequest() {
      setOpen(true);
    }

    document.addEventListener("keydown", onKeyDown);
    window.addEventListener(COMMAND_PALETTE_EVENT, onRequest);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(COMMAND_PALETTE_EVENT, onRequest);
    };
  }, []);

  return open ? <CommandPaletteDialog onClose={close} /> : null;
}
