"use client";

import type { CSSProperties, MouseEvent } from "react";
import { chartCatVar } from "@/components/finances/insights/chartColors";
import type { PlexNode } from "@/lib/brain/plex";

/** The colour a type gives its thoughts; untyped thoughts wear the neutral rule colour. */
export function typeColor(color: number | null): string {
  return color === null ? "var(--rule-strong)" : chartCatVar(color);
}

/**
 * One thought on the plex. Positioned by `transform`, and keyed by thought id upstream, so a
 * thought that stays in view slides to its new place when another one is centred.
 */
export function ThoughtChip({
  node,
  name,
  color,
  onOpen,
  onMenu,
}: {
  node: PlexNode;
  name: string;
  color: number | null;
  onOpen: (event: MouseEvent) => void;
  onMenu: (event: MouseEvent) => void;
}) {
  const centre = node.zone === "centre";
  const more = node.more !== undefined;
  const style: CSSProperties = {
    width: node.w,
    height: node.h,
    transform: `translate(${node.x}px, ${node.y}px)`,
    ...(more ? {} : { borderLeftColor: typeColor(color) }),
  };

  return (
    <button
      type="button"
      onClick={onOpen}
      onContextMenu={onMenu}
      title={more ? `${node.more} more` : name}
      aria-current={centre ? "true" : undefined}
      style={style}
      className={`absolute left-0 top-0 flex animate-[nav-dim_250ms_ease-out] items-center rounded border px-2 text-left text-[0.8125rem] transition-transform duration-300 ease-out motion-reduce:animate-none motion-reduce:transition-none ${
        centre
          ? "z-10 border-2 border-select-edge bg-select font-semibold text-ink"
          : more
            ? "justify-center border-dashed border-rule-strong bg-surface text-ink-muted hover:bg-surface-raised"
            : "border-l-4 border-rule bg-surface-raised text-ink hover:border-rule-strong hover:bg-surface"
      } ${node.zone === "siblings" ? "opacity-80" : ""}`}
    >
      <span className="truncate">{more ? `+${node.more} more` : name}</span>
    </button>
  );
}
