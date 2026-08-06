"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
  /**
   * A family folded behind one row: `Convert to ▸`. Opens a fly-out on the desktop.
   *
   * Which families fold is declared once in `NESTED_SECTIONS`, not decided here — see
   * `menus.ts` for why it is a list rather than a row-count threshold.
   */
  | {
      label: string;
      icon?: CommandIcon;
      title?: string;
      /** Every child unavailable. The row still shows — `navigation.md`: unavailable, not absent. */
      disabled?: boolean;
      items: MenuItem[];
    }
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

type Selectable = Extract<MenuItem, { onSelect: () => void }>;
type Submenu = Extract<MenuItem, { items: MenuItem[] }>;

function isCommand(item: MenuItem): item is Selectable {
  return item !== "separator" && "onSelect" in item;
}

export function isSubmenu(item: MenuItem): item is Submenu {
  return item !== "separator" && "items" in item;
}

function isHeading(item: MenuItem): item is { heading: string } {
  return item !== "separator" && "heading" in item;
}

/**
 * Can the arrow keys land here?
 *
 * Deliberately wider than `isCommand`: a submenu row is not choosable but **is** navigable, and
 * conflating the two would make `Convert to ▸` the one row the keyboard skips — on the Outline,
 * the only path to the conversions.
 */
function isNavigable(item: MenuItem): item is Selectable | Submenu {
  return isCommand(item) || isSubmenu(item);
}

/**
 * Turn the declared menu tree into rows.
 *
 * The single adapter every menu surface goes through, which is what stops the row menu and the
 * command bar from labelling the same command differently — the labels, the shortcuts and the
 * disabled reasons all arrive from the one `Command`.
 *
 * An unlabelled section leads without a heading; the rest get one. A section the menu tree marked
 * `submenu` becomes a *single row* instead, opening onto its commands.
 *
 * **Consecutive submenu rows are not separated from each other.** A run of them already reads as
 * one block — they are single rows of the same shape — and ruling between every pair produced a
 * menu that was more hairline than menu: the Outline's row menu folds four families in a row.
 */
export function menuItemsFor(sections: readonly MenuSection[]): MenuItem[] {
  const items: MenuItem[] = [];
  let previousWasSubmenu = false;

  for (const section of sections) {
    const nested = section.submenu === true && section.label !== null;

    if (items.length > 0 && !(nested && previousWasSubmenu)) items.push("separator");
    previousWasSubmenu = nested;

    if (nested) {
      items.push({
        label: section.label as string,
        // The family's glyph, taken from its first member: a section that folds is one whose
        // commands are variants of a single verb, so they already share an icon.
        icon: section.commands[0]?.icon,
        // A fly-out where nothing can be chosen is a hover that leads nowhere. Grey the row and
        // borrow the first child's reason, which is the same for all of them ("Select a row
        // first", "Already a Task").
        disabled: section.commands.every((command) => command.disabled === true),
        title: section.commands.every((command) => command.disabled === true)
          ? section.commands[0]?.title
          : undefined,
        items: section.commands.map(commandItem),
      });
      continue;
    }

    if (section.label !== null) items.push({ heading: section.label });
    for (const command of section.commands) items.push(commandItem(command));
  }

  return items;
}

function commandItem(command: MenuSection["commands"][number]): MenuItem {
  return {
    label: command.label,
    icon: command.icon,
    shortcut: formatBindings(command.bindings),
    title: command.title,
    disabled: command.disabled,
    destructive: command.destructive,
    onSelect: command.run,
  };
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
  openIndex = null,
  onHover,
  onChoose,
  onOpenSubmenu,
  rowClassName = "",
}: {
  items: readonly MenuItem[];
  /** Keyboard highlight. `ColumnMenu` drives its own selection and passes nothing. */
  activeIndex?: number | null;
  /** Which submenu row is currently flown out. Only `ContextMenu` tracks this. */
  openIndex?: number | null;
  onHover?: (index: number) => void;
  onChoose: (item: Selectable) => void;
  /** Click or hover on a submenu row. Absent means submenu rows are inert (`ColumnMenu`). */
  onOpenSubmenu?: (index: number) => void;
  /** Escape hatch for a container that imposes inherited type styling. */
  rowClassName?: string;
}) {
  // One decision for the whole menu: the gutter is reserved for every row once *any* row has a
  // glyph, so the labels line up in a column. A menu whose text starts at two different x positions
  // depending on whether that particular verb got drawn is worse than one with no icons at all.
  const hasIcons = items.some((item) => isNavigable(item) && item.icon !== undefined);

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

        const nested = isSubmenu(item);
        const destructive = !nested && item.destructive === true;

        return (
          <button
            key={`${item.label}-${index}`}
            type="button"
            role="menuitem"
            // The measuring hook: `ContextMenu` places the fly-out from this row's rect. A ref
            // would have to be threaded through `MenuList` for a position only the root cares
            // about, and `ColumnMenu` renders the same list with no fly-out at all.
            data-menu-index={index}
            aria-haspopup={nested ? "menu" : undefined}
            aria-expanded={nested ? openIndex === index : undefined}
            disabled={item.disabled}
            title={item.title}
            // A menu row is not a tab stop — the menu itself owns the keyboard. Chrome focuses a
            // `<button>` on mousedown, which mattered to nothing while every click closed the
            // menu, and starts mattering now that clicking a submenu row leaves it open.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => (nested ? onOpenSubmenu?.(index) : onChoose(item))}
            onMouseEnter={() => onHover?.(index)}
            className={[
              "flex w-full items-center gap-3 px-3 py-1 text-left text-[0.8125rem] leading-5",
              rowClassName,
              item.disabled
                ? "cursor-not-allowed text-ink-faint"
                : destructive
                  ? "text-priority-a"
                  : "text-ink",
              // An open fly-out keeps its parent row lit, so the trail from the menu to the panel
              // beside it stays visible while the pointer is over there.
              !item.disabled && (activeIndex === index || openIndex === index)
                ? "bg-surface-raised"
                : "",
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
            {nested ? (
              <span
                aria-hidden
                className="flex-none pl-3 text-[0.6875rem] text-ink-faint"
              >
                ▸
              </span>
            ) : (
              item.shortcut && (
                <span className="tabular flex-none pl-3 text-[0.6875rem] text-ink-faint">
                  {item.shortcut}
                </span>
              )
            )}
          </button>
        );
      })}
    </>
  );
}

/**
 * How long the pointer must rest on a submenu row before it opens. Long enough that passing
 * through on the way somewhere else does not flash a panel; short enough that stopping there
 * feels like it opened on contact.
 */
const HOVER_INTENT_MS = 120;

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
  const subRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  const [active, setActive] = useState<number | null>(null);
  /** The submenu row currently flown out, and the highlight inside it. */
  const [openSub, setOpenSub] = useState<number | null>(null);
  const [subActive, setSubActive] = useState<number | null>(null);

  const openItem = openSub === null ? null : items[openSub];
  const subItems = openItem && isSubmenu(openItem) ? openItem.items : null;

  // A pending open must not fire into an unmounted menu — choosing a row closes the whole thing
  // while the timer from the hover that got you there is still counting down.
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  const openSubmenu = useCallback(
    (index: number) => {
      const item = items[index];
      if (!isSubmenu(item) || item.disabled) return;
      setActive(index);
      setOpenSub(index);
      setSubActive(null);
    },
    [items],
  );

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

  /**
   * Place the fly-out beside its parent row.
   *
   * It is a **sibling** of the menu, not a child of the row, because the menu is
   * `overflow-y-auto` and a scroll container clips on both axes — a panel nested inside the row
   * would be cut off at the menu's right edge, which is the one place it has to be. So the row
   * is measured through `data-menu-index` and the panel is positioned from that rect.
   */
  useLayoutEffect(() => {
    const panel = subRef.current;
    const menu = ref.current;
    if (!panel || !menu || openSub === null) return;

    const row = menu.querySelector<HTMLElement>(`[data-menu-index="${openSub}"]`);
    if (!row) return;

    const margin = 4;
    const available = window.innerHeight - margin * 2;
    panel.style.maxHeight = `${available}px`;

    const rowRect = row.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const { width, height } = panel.getBoundingClientRect();

    // Overlap the parent's border by a pixel so the pointer can cross the seam without passing
    // over the grid — leaving the menu is what closes it.
    const right = menuRect.right - 1;
    const left =
      right + width > window.innerWidth - margin
        ? Math.max(margin, menuRect.left - width + 1)
        : right;
    // Top-aligned to its row, then pulled up if that would run off the bottom. `py-1` on the
    // panel is why the row's own top, not its centre, is the anchor.
    const top = Math.max(
      margin,
      Math.min(rowRect.top - margin, window.innerHeight - height - margin),
    );

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }, [openSub, subItems]);

  useLayoutEffect(() => {
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      // The fly-out is a sibling, so `contains` on the menu alone would treat every click in an
      // open submenu as a click outside and close the whole thing before the row could fire.
      if (ref.current?.contains(target) || subRef.current?.contains(target)) return;
      onClose();
    }
    /**
     * Switching away from the app dismisses the menu — but **only** the window's own blur.
     *
     * A `blur` from an element *inside* the menu reaches this listener too, with the element as
     * its target. That never showed while every click closed the menu anyway; with a submenu row
     * it would mean any focus landing in the menu dismisses it.
     */
    function onWindowBlur(event: FocusEvent) {
      if (event.target === window) onClose();
    }

    // Anything that moves the row out from under the menu closes it rather than leaving it
    // pointing at the wrong place.
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onWindowBlur);

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
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  /**
   * Next landable item in `step` direction, skipping separators, **headings** and disabled
   * entries.
   *
   * A heading that took arrow focus would be a row you can land on and not act on, which reads as
   * the menu having stopped responding. The test is `isNavigable`, not `isCommand`: a submenu row
   * is not choosable but must be reachable, or `Convert to ▸` becomes the one row the arrow keys
   * refuse to visit.
   */
  function step(
    list: readonly MenuItem[],
    from: number | null,
    delta: number,
  ): number | null {
    const count = list.length;
    for (let i = 1; i <= count; i++) {
      const index =
        ((((from ?? (delta > 0 ? -1 : 0)) + delta * i) % count) + count) % count;
      const item = list[index];
      if (isNavigable(item) && !item.disabled) return index;
    }
    return null;
  }

  function choose(item: MenuItem) {
    if (!isCommand(item) || item.disabled) return;
    onClose();
    item.onSelect();
  }

  /** Back out of an open fly-out; `false` when there was none, so the caller can close instead. */
  function closeSubmenu(): boolean {
    if (openSub === null) return false;
    setOpenSub(null);
    setSubActive(null);
    return true;
  }

  /**
   * Hover on a parent row: highlight now, open the fly-out after a beat.
   *
   * The delay is the whole point. Without it, dragging the pointer down the menu past
   * `Convert to ▸` flashes a panel over the rows below on the way to the one you wanted. With
   * it, passing through costs nothing and resting opens.
   *
   * A row that is not a submenu closes the open one **immediately** — that is the gesture that
   * means "I am done with that family", and delaying it would leave a stale panel over the rows
   * the pointer just moved to.
   */
  function hover(index: number) {
    setActive(index);
    window.clearTimeout(hoverTimer.current);

    const item = items[index];
    if (isSubmenu(item) && !item.disabled) {
      if (index === openSub) return;
      hoverTimer.current = window.setTimeout(() => openSubmenu(index), HOVER_INTENT_MS);
    } else if (openSub !== null) {
      closeSubmenu();
    }
  }

  const menu = (
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
      //
      // One handler for both panels. The fly-out never takes focus of its own — two keydown
      // listeners racing over one menu is how `Escape` ends up closing the wrong level — so the
      // arrow keys read `openSub` to decide which list they are walking.
      onKeyDown={(event) => {
        event.stopPropagation();
        event.nativeEvent.stopImmediatePropagation();
        const inSub = subItems !== null;
        const list = inSub ? subItems : items;
        const at = inSub ? subActive : active;
        const setAt = inSub ? setSubActive : setActive;

        switch (event.key) {
          case "ArrowDown":
            event.preventDefault();
            setAt(step(list, at, 1));
            break;
          case "ArrowUp":
            event.preventDefault();
            setAt(step(list, at, -1));
            break;
          case "Home":
            event.preventDefault();
            setAt(step(list, null, 1));
            break;
          case "End":
            event.preventDefault();
            setAt(step(list, null, -1));
            break;
          case "ArrowRight":
            // Only meaningful on a closed submenu row; inside one there is nowhere further right.
            if (!inSub && active !== null && isSubmenu(items[active])) {
              event.preventDefault();
              openSubmenu(active);
              setSubActive(step(items[active].items, null, 1));
            }
            break;
          case "ArrowLeft":
            if (closeSubmenu()) event.preventDefault();
            break;
          case "Enter":
          case " ":
            event.preventDefault();
            if (at === null) break;
            // Enter opens a family rather than choosing it, and lands on its first row — the
            // same gesture desktop menus have always used.
            if (!inSub && isSubmenu(list[at])) {
              openSubmenu(at);
              setSubActive(step(list[at].items, null, 1));
            } else {
              choose(list[at]);
            }
            break;
          case "Escape":
            event.preventDefault();
            // Escape backs out one level at a time, so a mis-opened fly-out does not cost you
            // the menu.
            if (!closeSubmenu()) onClose();
            break;
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
        openIndex={openSub}
        onHover={hover}
        onChoose={choose}
        onOpenSubmenu={openSubmenu}
      />
    </div>
  );

  return subItems === null ? (
    menu
  ) : (
    <>
      {menu}
      <div
        ref={subRef}
        role="menu"
        aria-orientation="vertical"
        // Focus stays on the parent, which owns the keyboard for both levels. Pointer users get
        // the same rows; the highlight is driven from here.
        className="fixed z-50 min-w-[11rem] overflow-y-auto overscroll-contain rounded border border-rule-strong bg-surface py-1 shadow-lg"
        style={{ left: -9999, top: -9999 }}
      >
        <MenuList
          items={subItems}
          activeIndex={subActive}
          onHover={setSubActive}
          onChoose={choose}
        />
      </div>
    </>
  );
}
