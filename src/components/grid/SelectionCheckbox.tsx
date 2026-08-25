"use client";

import { useEffect, useRef, type MouseEvent } from "react";
import type { SelectAllState } from "@/lib/grid/selection";

/**
 * Row and header selection box. A real checkbox so the header can be indeterminate;
 * click is owned here so Shift/⌘ reach `onSelect` instead of the native toggle.
 */
export function SelectionCheckbox({
  state,
  onSelect,
  ariaLabel,
  compact = false,
}: {
  state: SelectAllState | boolean;
  onSelect: (event: MouseEvent<HTMLInputElement>) => void;
  ariaLabel: string;
  compact?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const checked = state === true || state === "all";
  const indeterminate = state === "some";

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      aria-label={ariaLabel}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(event);
      }}
      onChange={() => {
        // Click already applied the selection. Native change would fight React `checked`.
      }}
      onMouseDown={(event) => {
        // Do not start a row drag from the box, and do not let the handle steal the click.
        event.stopPropagation();
      }}
      className={
        compact
          ? "h-5 w-5 shrink-0 accent-select-edge"
          : "h-3.5 w-3.5 shrink-0 accent-select-edge"
      }
    />
  );
}
