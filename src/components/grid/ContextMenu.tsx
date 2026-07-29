"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * A right-click menu over a grid row.
 *
 * The menu is a third route to commands that already exist on the toolbar and the keyboard,
 * never the only way to reach one — `ux-principles.md` asks that nothing be reachable by
 * mouse alone. Each item prints its shortcut for exactly that reason: the menu is also how
 * the keyboard gets taught.
 */
export type MenuItem =
  | "separator"
  | {
      label: string;
      /** Printed on the right, e.g. "⌥↑". Purely informational. */
      shortcut?: string;
      disabled?: boolean;
      destructive?: boolean;
      onSelect: () => void;
    };

type Command = Exclude<MenuItem, "separator">;

function isCommand(item: MenuItem): item is Command {
  return item !== "separator";
}

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);

  // Positioned imperatively after measuring: the menu has to be in the document to know how
  // tall it is, and re-rendering to move it would flash it at the wrong place first.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const margin = 4;
    const left = Math.max(margin, Math.min(x, window.innerWidth - width - margin));
    // Near the bottom of the window the menu opens upward, the way desktop menus do.
    const top =
      y + height > window.innerHeight - margin
        ? Math.max(margin, y - height)
        : Math.min(y, window.innerHeight - height - margin);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    // preventScroll: focusing must not shift the grid under a menu that is already placed.
    el.focus({ preventScroll: true });
  }, [x, y]);

  useLayoutEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    // Anything that moves the row out from under the menu closes it rather than leaving it
    // pointing at the wrong place.
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);

    // Scroll closes the menu, but not the scroll the menu itself causes: right-clicking
    // selects the row, and a partly-visible selected row scrolls into view on the very
    // frame the menu opens. Listening from the next frame skips exactly that one.
    const frame = requestAnimationFrame(() =>
      document.addEventListener("scroll", onClose, true),
    );

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
      document.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  /** Next selectable item in `step` direction, skipping separators and disabled entries. */
  function step(from: number | null, delta: number): number | null {
    const count = items.length;
    for (let i = 1; i <= count; i++) {
      const index =
        ((((from ?? (delta > 0 ? -1 : 0)) + delta * i) % count) + count) % count;
      const item = items[index];
      if (isCommand(item) && !item.disabled) return index;
    }
    return null;
  }

  function choose(item: MenuItem) {
    if (!isCommand(item) || item.disabled) return;
    onClose();
    item.onSelect();
  }

  return (
    <div
      ref={ref}
      role="menu"
      aria-orientation="vertical"
      tabIndex={-1}
      // While the menu is open it owns the keyboard — Delete must not reach the outline's
      // delete-row shortcut behind it.
      //
      // `stopPropagation` alone is not enough. App Router hydrates on `document`, so React's
      // delegated listener and the outline's own `document` keydown listener are two
      // listeners on the *same* node, and stopping propagation never cancels siblings.
      // Only `stopImmediatePropagation` on the native event does.
      onKeyDown={(event) => {
        event.stopPropagation();
        event.nativeEvent.stopImmediatePropagation();
        switch (event.key) {
          case "ArrowDown":
            event.preventDefault();
            setActive(step(active, 1));
            break;
          case "ArrowUp":
            event.preventDefault();
            setActive(step(active, -1));
            break;
          case "Home":
            event.preventDefault();
            setActive(step(null, 1));
            break;
          case "End":
            event.preventDefault();
            setActive(step(null, -1));
            break;
          case "Enter":
          case " ":
            event.preventDefault();
            if (active !== null) choose(items[active]);
            break;
          case "Escape":
          case "Tab":
            event.preventDefault();
            onClose();
            break;
        }
      }}
      className="fixed z-50 min-w-[13rem] rounded border border-rule-strong bg-surface py-1 shadow-lg"
      // The menu takes focus only so it can own the keyboard; the highlighted item is the
      // visible cue, so the global :focus-visible ring would just draw a box around itself.
      style={{ left: x, top: y, outline: "none" }}
    >
      {items.map((item, index) =>
        item === "separator" ? (
          <div
            key={`separator-${index}`}
            role="separator"
            className="my-1 h-px bg-rule"
          />
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => choose(item)}
            onMouseEnter={() => setActive(index)}
            className={[
              "flex w-full items-center gap-6 px-3 py-1 text-left text-[0.8125rem] leading-5",
              item.disabled
                ? "cursor-not-allowed text-ink-faint"
                : item.destructive
                  ? "text-priority-a"
                  : "text-ink",
              !item.disabled && active === index ? "bg-surface-raised" : "",
            ].join(" ")}
          >
            <span className="flex-1 truncate">{item.label}</span>
            {item.shortcut && (
              <span className="tabular flex-none text-[0.6875rem] text-ink-faint">
                {item.shortcut}
              </span>
            )}
          </button>
        ),
      )}
    </div>
  );
}
