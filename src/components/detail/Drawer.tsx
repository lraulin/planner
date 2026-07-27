"use client";

import { useEffect, useRef } from "react";
import { useModalFocus } from "./focus";

/**
 * The right-sliding drawer from `standards/components/drawer-pattern.md`.
 *
 * The outline stays visible and readable behind it — that is the whole reason this is not a
 * modal — so the backdrop is a light scrim rather than a blackout, and the panel starts
 * below the app chrome so the tab strip stays clickable.
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
        className="relative flex h-full w-full flex-col border-l border-rule-strong bg-surface shadow-2xl outline-none sm:w-[90%] md:max-w-[45rem]"
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
  title,
  onClose,
}: {
  titleId: string;
  eyebrow: string;
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-none items-start gap-3 border-b border-rule px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
          {eyebrow}
        </p>
        <h2 id={titleId} className="truncate text-[1.0625rem] font-semibold text-ink">
          {title || "Untitled"}
        </h2>
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="-mr-1 flex h-7 w-7 flex-none items-center justify-center rounded text-[1.125rem] leading-none text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
      >
        ×
      </button>
    </div>
  );
}

/**
 * The drawer's footer. Save stays enabled unless a save is already in flight — blocking
 * errors surface on the attempt rather than by disabling the button, per `ux-principles.md`.
 */
export function DrawerFooter({
  onSave,
  onClose,
  saving,
  dirty,
  error,
}: {
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  dirty: boolean;
  error: string | null;
}) {
  return (
    <div className="flex-none border-t border-rule">
      {error && (
        <p
          role="alert"
          className="border-b border-priority-a/40 bg-priority-a/10 px-5 py-2 text-[0.8125rem] text-priority-a"
        >
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 px-5 py-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded border border-select-edge bg-select px-3 py-1.5 text-[0.8125rem] font-medium text-ink transition-colors hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>

        <button
          type="button"
          onClick={onClose}
          className="rounded border border-rule px-3 py-1.5 text-[0.8125rem] text-ink transition-colors hover:border-rule-strong hover:bg-surface-raised"
        >
          Close
        </button>

        {dirty && (
          <span className="ml-auto text-[0.75rem] text-ink-muted">Unsaved changes</span>
        )}
      </div>
    </div>
  );
}
