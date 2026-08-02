"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.offsetParent !== null || element === document.activeElement,
  );
}

/**
 * Modal focus behaviour, shared by the drawer and the confirmation dialog: focus moves
 * inside when it opens, Tab cycles within it while it is open, and focus returns to
 * whatever opened it on close.
 *
 * `drawer-pattern.md` requires the return — losing your place in the outline after closing
 * a drawer is the thing that makes a drawer feel worse than the modal it replaced.
 */
export function useModalFocus(ref: RefObject<HTMLElement | null>, open: boolean): void {
  useEffect(() => {
    if (!open) return;
    const container = ref.current;
    if (!container) return;

    const opener = document.activeElement as HTMLElement | null;

    // Prefer a real form field over header chrome (Delete / Close). `autoFocus` wins when
    // set; otherwise the first input/select/textarea; otherwise the first focusable control.
    const elements = focusable(container);
    const preferred =
      container.querySelector<HTMLElement>("[autofocus]") ??
      elements.find((el) => {
        const tag = el.tagName;
        return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      }) ??
      elements[0];
    (preferred ?? container).focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab" || !container) return;

      const elements = focusable(container);
      if (elements.length === 0) return;

      const firstElement = elements[0];
      const lastElement = elements[elements.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === firstElement || active === container)) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && active === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // The opener may have been removed from the DOM (a deleted row), so check first.
      if (opener?.isConnected) opener.focus();
    };
  }, [ref, open]);
}
