"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ElementSize = { width: number; height: number };

/**
 * The measured content box of an element, or `null` until it has been measured.
 *
 * For drawings that need a real number rather than a percentage. The Timeline ribbon decides
 * how many axis marks fit and whether a pin has room for its label; both were guessed from an
 * assumed narrow width before this existed, which was safe and wrong on a 1440px screen. The
 * Metrics graph draws in the pane's own pixels, because stretching a fixed viewBox to fit a
 * resizable pane scales x and y by different amounts and squashes every label in it.
 *
 * `null` on the first render and on the server, deliberately — the same shape as `useToday`. A
 * measurement is a fact about the browser, so the pre-measurement render is a drawing of what is
 * known, not a placeholder to be suppressed.
 */
export function useElementSize<T extends HTMLElement>(): {
  ref: (node: T | null) => void;
  size: ElementSize | null;
} {
  const [size, setSize] = useState<ElementSize | null>(null);
  const observer = useRef<ResizeObserver | null>(null);

  useEffect(() => () => observer.current?.disconnect(), []);

  /*
   * A callback ref rather than `useRef` + an effect: the node this measures can arrive and leave
   * with the presentation toggle, and an effect keyed on a ref object does not re-run when the
   * ref's *contents* change — the classic version of this hook silently measures nothing the
   * second time the element mounts.
   */
  const ref = useCallback((node: T | null) => {
    observer.current?.disconnect();
    if (!node) return;

    // Keep the same object when neither dimension moved, so the reader does not re-render.
    const measure = (width: number, height: number) =>
      setSize((prev) =>
        prev?.width === width && prev.height === height ? prev : { width, height },
      );

    measure(node.clientWidth, node.clientHeight);
    observer.current = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) measure(entry.contentRect.width, entry.contentRect.height);
    });
    observer.current.observe(node);
  }, []);

  return { ref, size };
}
