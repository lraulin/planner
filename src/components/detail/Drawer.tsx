"use client";

import { useEffect, useRef } from "react";
import { formatBindings, matchBindings } from "@/lib/commands/bindings";
import { COMMIT_FORM, SAVE } from "@/lib/commands/chords";
import { comboboxOwnsEscape, useModalFocus } from "./focus";

const SAVE_CHORD = formatBindings(SAVE) ?? "⌘S";
const COMMIT_CHORD = formatBindings(COMMIT_FORM) ?? "⌘⏎";

/**
 * The right-sliding drawer from `standards/components/drawer-pattern.md`.
 *
 * The outline stays visible and readable behind it — that is the whole reason this is not a
 * modal — so the backdrop is a light scrim rather than a blackout, and the panel starts
 * below the app chrome so the tab strip stays clickable.
 *
 * Below `md` it is a **full-screen sheet** instead — no scrim, no chrome behind it. Context
 * preservation is what the side drawer buys, and at 390px it is unaffordable: there is no
 * arrangement that keeps a grid legible behind a form worth filling in. `ux-principles.md`
 * and `drawer-pattern.md` both say so out loud rather than leaving the code to contradict
 * them.
 *
 * No transition is declared here: `globals.css` already disables motion for anyone who asks
 * for reduced motion, and reintroducing one inline would step around that.
 */
export function Drawer({
  open,
  onClose,
  labelledBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useModalFocus(panelRef, open);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        // An expanded combobox closes its own list first — see `comboboxOwnsEscape`.
        if (comboboxOwnsEscape()) return;
        event.preventDefault();
        // Stop the outline's own Escape handling from also firing behind the drawer.
        event.stopPropagation();
        onClose();
      }
    }

    // Capture phase: the drawer is on top, so it decides what Escape means while it is open.
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div
        onClick={onClose}
        aria-hidden
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--ink)_18%,transparent)]"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        // `h-dvh` below `md`, not `h-full`: the fixed parent resolves against iOS's large
        // viewport, so `h-full` puts the footer under Safari's toolbar.
        className="relative flex h-dvh w-full flex-col border-l border-rule-strong bg-surface shadow-2xl outline-none sm:w-[90%] md:h-full md:max-w-[45rem]"
      >
        {children}
      </div>
    </div>
  );
}

/** The drawer's header: the record's title, a type label, and the close button. */
export function DrawerHeader({
  titleId,
  eyebrow,
  icon,
  title,
  onClose,
  actions,
}: {
  titleId: string;
  eyebrow?: string;
  /** The type glyph, shown beside the eyebrow. The same one the outline row draws. */
  icon?: React.ReactNode;
  title: string;
  onClose: () => void;
  /** Optional controls before the × (e.g. Delete). */
  actions?: React.ReactNode;
}) {
  return (
    // The sheet covers the whole screen below `md`, so this header is what sits under the
    // notch — nothing above it is carrying that inset.
    <div className="pt-safe flex flex-none items-start gap-3 border-b border-rule px-5 py-3">
      <div className="min-w-0 flex-1">
        {eyebrow != null && eyebrow !== "" && (
          <p className="flex items-center gap-1.5 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
            {icon}
            {eyebrow}
          </p>
        )}
        <h2 id={titleId} className="truncate text-[1.0625rem] font-semibold text-ink">
          {title || "Untitled"}
        </h2>
      </div>

      {actions}

      <button
        type="button"
        onClick={onClose}
        title="Close"
        aria-label="Close"
        className="-mr-1 flex h-tap w-tap flex-none items-center justify-center rounded text-[1.25rem] leading-none text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink md:h-7 md:w-7 md:text-[1.125rem]"
      >
        ×
      </button>
    </div>
  );
}

/**
 * Sticky drawer footer for explicit-save forms (`drawer-pattern.md`).
 *
 * Layout (LTR):
 *   [ Cancel ]                          [ Save ]  [ Save & Close ]
 *
 * - **Cancel** (left, ghost) — leave; parent prompts when dirty.
 * - **Save** (right, outlined) — persist and stay open; shows "Saved".
 * - **Save & Close** (rightmost, solid primary) — persist then leave.
 *
 * Below `md` the same three buttons restack — Save & Close full width on top, Save and Cancel
 * beneath — and the whole footer pads with `.pb-safe` to clear the home indicator. The
 * arrangement changes; the set does not. `drawer-pattern.md` is explicit that dropping a
 * button to save room on a phone is not an option.
 *
 * Shortcuts: Save and Save & Close chords come from `chords.ts` so tooltips cannot
 * drift from the listener. Esc is handled by `Drawer` on the same dirty-aware close path.
 *
 * `justSaved` is set after a successful stay-open Save and cleared on the next edit.
 */
export function DrawerFooter({
  onSave,
  onSaveAndClose,
  onClose,
  saving,
  dirty,
  justSaved,
  error,
}: {
  onSave: () => void;
  /** Persist then leave on success. Failed saves must stay open with the error. */
  onSaveAndClose: () => void;
  /** Leave / discard path (same as header × and Escape). */
  onClose: () => void;
  saving: boolean;
  dirty: boolean;
  /** True after a successful Save while the form is still clean. */
  justSaved?: boolean;
  error: string | null;
}) {
  const status = dirty ? "Unsaved changes" : justSaved && !saving ? "Saved" : null;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Don't steal shortcuts from a textarea / contenteditable mid-edit — except Save,
      // which should always mean "save progress" rather than the browser's Save Page.
      const target = event.target;
      const inText =
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);

      if (matchBindings(event, SAVE)) {
        event.preventDefault();
        if (!saving) onSave();
        return;
      }

      if (matchBindings(event, COMMIT_FORM)) {
        if (inText) return;
        event.preventDefault();
        if (!saving) onSaveAndClose();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onSave, onSaveAndClose, saving]);

  return (
    <div className="pb-safe flex-none border-t border-rule bg-surface">
      {error && (
        <p
          role="alert"
          className="border-b border-priority-a/40 bg-priority-a/10 px-5 py-2 text-[0.8125rem] text-priority-a"
        >
          {error}
        </p>
      )}

      {/*
       * Two groups, reversed below `md`: the save pair lands on top where a thumb reaches it,
       * with Cancel and the status line underneath. Above `md` it is the original single row —
       * Cancel left, saves right.
       *
       * `flex-col-reverse` rather than two copies of Save: rendering the button twice and
       * hiding one per breakpoint would put two identical controls in the tree and in every
       * query written against it.
       */}
      <div className="flex flex-col-reverse gap-2 px-5 py-3 md:flex-row md:flex-wrap md:items-center">
        <div className="flex min-h-tap items-center gap-2 md:min-h-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-tap rounded px-3 py-1.5 text-[0.8125rem] text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink md:min-h-0"
          >
            Cancel
          </button>

          {status && (
            <span className="text-[0.75rem] text-ink-muted sm:ml-1">{status}</span>
          )}
        </div>

        <div className="flex items-center gap-2 md:ml-auto">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            title={SAVE_CHORD}
            className="min-h-tap flex-1 rounded border border-rule px-3 py-1.5 text-[0.8125rem] text-ink transition-colors hover:border-rule-strong hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0 md:flex-none"
          >
            {saving ? "Saving…" : "Save"}
          </button>

          <button
            type="button"
            onClick={onSaveAndClose}
            disabled={saving}
            title={COMMIT_CHORD}
            className="min-h-tap flex-1 rounded border border-select-edge bg-select px-3 py-1.5 text-[0.8125rem] font-medium text-ink transition-colors hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0 md:flex-none"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
}
