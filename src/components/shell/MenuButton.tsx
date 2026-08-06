"use client";

import { useRef, useState, type ReactNode } from "react";
import { ContextMenu, type MenuItem } from "@/components/grid/ContextMenu";

/**
 * A named menu on the command bar. Click the label, get the menu.
 *
 * Anchored to the button's bottom-left rather than the pointer — this is a menu button, not a
 * right-click, and it has to land in the same place under a tap. That is `OverflowMenu`'s
 * measurement, generalised: both are now this component's job.
 *
 * Rendering goes through `ContextMenu`, which already solves the whole problem — arrow / Home /
 * End navigation skipping separators, headings and disabled rows, the right-aligned shortcut
 * column, the icon gutter, measuring then flipping upward near the bottom edge, and closing on
 * scroll without closing on the scroll it causes itself.
 */
export function MenuButton({
  label,
  items,
  title,
  ariaLabel,
  bordered = false,
  children,
}: {
  /** The word on the bar. Omit and supply `children` for an icon-only trigger. */
  label?: string;
  items: MenuItem[];
  title?: string;
  ariaLabel?: string;
  /**
   * Draw it as a control rather than a word. For `⋯`, which is the phone's whole command surface
   * and has to look like something you can press; the bar's named menus deliberately do not.
   */
  bordered?: boolean;
  children?: ReactNode;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  // Nothing to show means nothing to open. A button whose menu is empty reads as broken, which is
  // worse than reading as absent.
  if (items.length === 0) return null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          const rect = buttonRef.current?.getBoundingClientRect();
          setAt(rect ? { x: rect.left, y: rect.bottom + 2 } : { x: 0, y: 0 });
        }}
        aria-haspopup="menu"
        aria-expanded={at !== null}
        aria-label={ariaLabel ?? label}
        title={title}
        /*
         * Quiet until hovered, and it keeps the *open* state filled with `bg-surface-raised` so
         * the bar says which menu is down. No border: five bordered boxes in a row is the look
         * this whole change exists to remove, and a menu bar's job is to read as a line of words.
         *
         * 44px tall below `md` per `responsive.md`, even though the bar itself is desktop-only —
         * `MenuButton` is also what the Day grid's own header uses, and that one does render on a
         * phone.
         */
        className={[
          "flex min-h-tap flex-none items-center justify-center gap-1 rounded px-2 py-1 text-[0.8125rem] leading-none whitespace-nowrap transition-colors md:min-h-0",
          // 44 × 44 on both axes for an icon-only trigger — `responsive.md` is explicit that hit
          // target size is not covered by the accessibility exemption, and `⋯` is the phone's only
          // way to reach a view's commands.
          label ? "" : "min-w-tap md:min-w-0",
          bordered ? "border border-rule hover:border-rule-strong" : "",
          at !== null
            ? "bg-surface-raised text-ink"
            : "text-ink-muted hover:bg-surface-raised hover:text-ink",
        ].join(" ")}
      >
        {children}
        {label && <span>{label}</span>}
        {label && (
          <span aria-hidden className="text-[0.625rem] text-ink-faint">
            ▾
          </span>
        )}
      </button>

      {at && (
        <ContextMenu x={at.x} y={at.y} items={items} onClose={() => setAt(null)} />
      )}
    </>
  );
}
