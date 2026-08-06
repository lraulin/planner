"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { CommandGlyph } from "@/components/icons/commandIcons";
import { formatBindings } from "@/lib/commands/bindings";
import type { MenuSection } from "@/lib/commands/menus";
import type { CommandIcon } from "@/lib/commands/icons";

/**
 * The app's one menu renderer: row context menus, the command bar's menus, the `⋯` sheet, and the
 * per-column header menu.
 *
 * A menu is never the only way to reach a command — `ux-principles.md` asks that nothing be
 * reachable by mouse alone. Each item prints its shortcut for exactly that reason: the menu is
 * also how the keyboard gets taught.
 *
 * Sections and an icon gutter, both after Achieve's: a menu of fifteen unbroken rows is one you
 * read top to bottom every time, and the gutter is what lets you find the movement commands
 * without reading at all.
 */
export type MenuItem =
  | "separator"
  /** A section heading. Not focusable, not selectable — see `step`. */
  | { heading: string }
  | {
      label: string;
      /** Glyph for the left gutter. When any item in the menu has one, all rows reserve it. */
      icon?: CommandIcon;
      /** Printed on the right, e.g. "⌥↑". Purely informational. */
      shortcut?: string;
      /**
       * Hover explanation. Worth writing on a **disabled** item especially — "this column
       * cannot be hidden" is the difference between an unavailable control and a broken one.
       */
      title?: string;
      disabled?: boolean;
      destructive?: boolean;
      onSelect: () => void;
    };

type Selectable = Extract<MenuItem, { label: string }>;

function isCommand(item: MenuItem): item is Selectable {
  return item !== "separator" && "label" in item;
}

function isHeading(item: MenuItem): item is { heading: string } {
  return item !== "separator" && "heading" in item;
}

/**
 * Turn the declared menu tree into rows.
 *
 * The single adapter every menu surface goes through, which is what stops the row menu and the
 * command bar from labelling the same command differently — the labels, the shortcuts and the
 * disabled reasons all arrive from the one `Command`.
 *
 * An unlabelled section leads without a heading; the rest get one. A rule is drawn between
 * sections that both have headings only when it earns its place — the heading already separates
 * them — so the separator is reserved for the boundary *into* an unheaded run.
 */
export function menuItemsFor(sections: readonly MenuSection[]): MenuItem[] {
  const items: MenuItem[] = [];

  for (const section of sections) {
    if (items.length > 0) {
      if (section.label === null) items.push("separator");
      else items.push("separator", { heading: section.label });
    } else if (section.label !== null) {
      items.push({ heading: section.label });
    }

    for (const command of section.commands) {
      items.push({
        label: command.label,
        icon: command.icon,
        shortcut: formatBindings(command.bindings),
        title: command.title,
        disabled: command.disabled,
        destructive: command.destructive,
        onSelect: command.run,
      });
    }
  }

  return items;
}

/**
 * The rows themselves, shared with `ColumnMenu`'s tabbed popover.
 *
 * That popover used to hand-render this same `MenuItem[]` with its own copy of the label/shortcut
 * layout, which is how it ended up on `gap-6` while this one moved to `gap-3` — the two-renderers
 * problem in miniature, on the exact type whose whole job is to have one renderer. Now there is one.
 */
export function MenuList({
  items,
  activeIndex = null,
  onHover,
  onChoose,
  rowClassName = "",
}: {
  items: readonly MenuItem[];
  /** Keyboard highlight. `ColumnMenu` drives its own selection and passes nothing. */
  activeIndex?: number | null;
  onHover?: (index: number) => void;
  onChoose: (item: Selectable) => void;
  /** Escape hatch for a container that imposes inherited type styling. */
  rowClassName?: string;
}) {
  // One decision for the whole menu: the gutter is reserved for every row once *any* row has a
  // glyph, so the labels line up in a column. A menu whose text starts at two different x positions
  // depending on whether that particular verb got drawn is worse than one with no icons at all.
  const hasIcons = items.some((item) => isCommand(item) && item.icon !== undefined);

  return (
    <>
      {items.map((item, index) => {
        if (item === "separator") {
          return (
            <div
              key={`separator-${index}`}
              role="separator"
              className="my-1 h-px bg-rule"
            />
          );
        }

        if (isHeading(item)) {
          // The sidebar's section heading, exactly — same size, weight, tracking and colour, so a
          // menu and the nav read as one system rather than two designs.
          return (
            <h3
              key={`heading-${index}`}
              className="px-3 pt-1.5 pb-0.5 text-[0.625rem] font-semibold uppercase tracking-wider text-ink-faint"
            >
              {item.heading}
            </h3>
          );
        }

        return (
          <button
            key={`${item.label}-${index}`}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            title={item.title}
            onClick={() => onChoose(item)}
            onMouseEnter={() => onHover?.(index)}
            className={[
              "flex w-full items-center gap-3 px-3 py-1 text-left text-[0.8125rem] leading-5",
              rowClassName,
              item.disabled
                ? "cursor-not-allowed text-ink-faint"
                : item.destructive
                  ? "text-priority-a"
                  : "text-ink",
              !item.disabled && activeIndex === index ? "bg-surface-raised" : "",
              // Hover highlight for the surfaces that do not drive an active index themselves.
              !item.disabled && onHover === undefined ? "hover:bg-surface-raised" : "",
            ].join(" ")}
          >
            {hasIcons && (
              <span className="flex h-4 w-4 flex-none items-center justify-center text-ink-faint">
                <CommandGlyph icon={item.icon} />
              </span>
            )}
            <span className="flex-1 truncate">{item.label}</span>
            {item.shortcut && (
              <span className="tabular flex-none pl-3 text-[0.6875rem] text-ink-faint">
                {item.shortcut}
              </span>
            )}
          </button>
        );
      })}
    </>
  );
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

  /*
   * Positioned imperatively after measuring: the menu has to be in the document to know how tall it
   * is, and re-rendering to move it would flash it at the wrong place first.
   *
   * The **height cap** matters more than it looks. `⋯` is the phone's whole menu bar now, so on the
   * Outline it holds every command the view has — around forty rows, which is taller than an iPhone.
   * Before this it simply ran off the bottom and the rows down there could not be reached at all.
   * Capping to the viewport and scrolling inside is what `responsive.md` asks of any wide or tall
   * content: it scrolls in its own container rather than eating the page.
   */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const margin = 4;
    const available = window.innerHeight - margin * 2;
    el.style.maxHeight = `${available}px`;

    const { width, height } = el.getBoundingClientRect();
    const left = Math.max(margin, Math.min(x, window.innerWidth - width - margin));
    // Near the bottom of the window the menu opens upward, the way desktop menus do. A menu tall
    // enough to have been capped cannot do either, so it is pinned to the top margin.
    const top =
      height >= available
        ? margin
        : y + height > window.innerHeight - margin
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

  /**
   * Next selectable item in `step` direction, skipping separators, **headings** and disabled
   * entries.
   *
   * A heading that took arrow focus would be a row you can land on and not act on, which reads as
   * the menu having stopped responding. `isCommand` is the single test for "can be chosen", and it
   * is the same one `choose` uses.
   */
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
      // `overscroll-contain` so scrolling to the bottom of a long menu does not then start
      // scrolling the grid underneath it.
      className="fixed z-50 min-w-[13rem] overflow-y-auto overscroll-contain rounded border border-rule-strong bg-surface py-1 shadow-lg"
      // The menu takes focus only so it can own the keyboard; the highlighted item is the
      // visible cue, so the global :focus-visible ring would just draw a box around itself.
      style={{ left: x, top: y, outline: "none" }}
    >
      <MenuList
        items={items}
        activeIndex={active}
        onHover={setActive}
        onChoose={choose}
      />
    </div>
  );
}
