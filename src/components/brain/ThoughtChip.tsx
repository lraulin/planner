"use client";

import type { CSSProperties, MouseEvent, PointerEvent } from "react";
import { chartCatVar } from "@/components/finances/insights/chartColors";
import type { GateSide, PlexNode } from "@/lib/brain/plex";
import type { ThoughtGates } from "@/lib/brain/types";

/** The colour a type gives its thoughts; untyped thoughts wear the neutral rule colour. */
export function typeColor(color: number | null): string {
  return color === null ? "var(--rule-strong)" : chartCatVar(color);
}

const GATE_SIDES: GateSide[] = ["top", "bottom", "left", "right"];

const GATE_FLAG: Record<GateSide, keyof ThoughtGates> = {
  top: "parents",
  bottom: "children",
  left: "jumps",
  right: "jumps",
};

const GATE_NOUN: Record<GateSide, string> = {
  top: "parent",
  bottom: "child",
  left: "jump",
  right: "jump",
};

/* Hit areas are larger than the 8px dot they carry, and sit at the box edge, centred on it. */
const GATE_PLACE: Record<GateSide, string> = {
  top: "left-1/2 top-0 h-4 w-8 -translate-x-1/2 -translate-y-1/2 cursor-n-resize",
  bottom: "left-1/2 top-full h-4 w-8 -translate-x-1/2 -translate-y-1/2 cursor-s-resize",
  left: "left-0 top-1/2 h-8 w-3 -translate-x-1/2 -translate-y-1/2 cursor-w-resize",
  right: "left-full top-1/2 h-8 w-3 -translate-x-1/2 -translate-y-1/2 cursor-e-resize",
};

/**
 * One thought on the plex, TheBrain-style: a text label with a gate on each side. Positioned
 * by `transform`, and keyed by thought id upstream, so a thought that stays in view slides to
 * its new place when another one is centred.
 *
 * Gates are siblings of the label button, not children, so pressing one can never recentre.
 * A filled gate has links behind it; a hollow one has none.
 */
export function ThoughtChip({
  node,
  name,
  color,
  gates,
  dropTarget,
  onOpen,
  onMenu,
  onGateDown,
  onGateMove,
  onGateUp,
  onGateCancel,
}: {
  node: PlexNode;
  name: string;
  color: number | null;
  /** Absent on the "+N more" chip, which has no gates. */
  gates?: ThoughtGates;
  /** A gate drag is hovering over this thought, so letting go will link to it. */
  dropTarget: boolean;
  onOpen: (event: MouseEvent) => void;
  onMenu: (event: MouseEvent) => void;
  onGateDown: (side: GateSide, event: PointerEvent<HTMLElement>) => void;
  onGateMove: (event: PointerEvent<HTMLElement>) => void;
  onGateUp: (event: PointerEvent<HTMLElement>) => void;
  onGateCancel: () => void;
}) {
  const centre = node.zone === "centre";
  const more = node.more !== undefined;
  const style: CSSProperties = {
    width: node.w,
    height: node.h,
    transform: `translate(${node.x}px, ${node.y}px)`,
  };

  return (
    <div
      style={style}
      className={`absolute left-0 top-0 animate-[nav-dim_250ms_ease-out] transition-transform duration-300 ease-out motion-reduce:animate-none motion-reduce:transition-none ${
        centre ? "z-10" : ""
      } ${node.zone === "siblings" ? "opacity-70" : ""}`}
    >
      <button
        type="button"
        onClick={onOpen}
        onContextMenu={onMenu}
        title={more ? `${node.more} more` : name}
        aria-current={centre ? "true" : undefined}
        className={`flex size-full select-none items-center gap-2 rounded px-2 text-left text-[0.8125rem] ${
          centre
            ? "border-2 border-select-edge bg-select font-semibold text-ink"
            : more
              ? "justify-center border border-dashed border-rule-strong bg-surface text-ink-muted hover:bg-surface-raised"
              : "border border-transparent text-ink hover:bg-surface-raised"
        } ${dropTarget ? "bg-select ring-2 ring-select-edge" : ""}`}
      >
        {!more && (
          <span
            aria-hidden="true"
            className="size-2.5 flex-none rounded-full"
            style={{ background: typeColor(color) }}
          />
        )}
        <span className="truncate">{more ? `+${node.more} more` : name}</span>
      </button>

      {gates &&
        GATE_SIDES.map((side) => {
          const filled = gates[GATE_FLAG[side]];
          return (
            <span
              key={side}
              role="button"
              tabIndex={-1}
              aria-label={`Drag to add ${GATE_NOUN[side]} of ${name}`}
              onPointerDown={(event) => onGateDown(side, event)}
              onPointerMove={onGateMove}
              onPointerUp={onGateUp}
              onPointerCancel={onGateCancel}
              className={`group absolute z-10 flex touch-none items-center justify-center ${GATE_PLACE[side]}`}
            >
              <span
                className={`size-2 rounded-full border border-ink-muted transition-transform group-hover:scale-150 group-hover:border-select-edge ${
                  filled ? "bg-ink-muted group-hover:bg-select-edge" : "bg-surface"
                }`}
              />
            </span>
          );
        })}
    </div>
  );
}

/**
 * One thought in a search listbox — the brain search and the add-link box: its type's
 * colour, its name and, for a text match, the snippet that matched. Picks on mouse-down so
 * the input keeps focus.
 */
export function ThoughtOption({
  thought,
  active,
  onPick,
}: {
  thought: { name: string; color: number | null; snippet?: string };
  active: boolean;
  onPick: () => void;
}) {
  return (
    <li
      role="option"
      aria-selected={active}
      onMouseDown={(event) => {
        event.preventDefault();
        onPick();
      }}
      className={`flex min-h-tap cursor-pointer items-center gap-2 px-3 py-1.5 text-[0.875rem] ${
        active ? "bg-select" : "hover:bg-surface-raised"
      }`}
    >
      <span
        className="size-2.5 flex-none rounded-full"
        style={{ background: typeColor(thought.color) }}
      />
      <span className="truncate text-ink">{thought.name}</span>
      {thought.snippet && (
        <span className="truncate text-[0.75rem] text-ink-muted">
          {thought.snippet}
        </span>
      )}
    </li>
  );
}
