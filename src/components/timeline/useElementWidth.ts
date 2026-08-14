"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The measured content width of an element, or `null` until it has been measured.
 *
 * The ribbon needs a real number rather than a percentage for two decisions the browser cannot
 * make for it: how many axis marks fit, and whether a pin has room for its label. Both were
 * guessed from an assumed narrow width before this existed, which was safe and wrong on a
 * 1440px screen.
 *
 * `null` on the first render and on the server, deliberately — the same shape as `useToday`. A
 * measurement is a fact about the browser, so the pre-measurement render is a drawing of what is
 * known, not a placeholder to be suppressed.
 */
export function useElementWidth<T extends HTMLElement>(): {
  ref: (node: T | null) => void;
  width: number | null;
} {
  const [width, setWidth] = useState<number | null>(null);
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

    setWidth(node.clientWidth);
    observer.current = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.current.observe(node);
  }, []);

  return { ref, width };
}
