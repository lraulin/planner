"use client";

import type { MouseEvent } from "react";
import type { Neighbourhood } from "@/lib/brain/neighbourhood";
import type { ThoughtRef } from "@/lib/brain/types";
import { typeColor } from "./ThoughtChip";

/**
 * The plex below `md`: no canvas, just the four neighbour groups as tappable lists with 44px
 * rows (`responsive.md`). Long-press opens the same menu a right-click does.
 */
export function BrainMobile({
  hood,
  thoughts,
  onOpen,
  onMenu,
}: {
  hood: Neighbourhood;
  thoughts: Record<string, ThoughtRef>;
  onOpen: (thoughtId: string) => void;
  onMenu: (thoughtId: string, event: MouseEvent) => void;
}) {
  const groups: { title: string; ids: string[] }[] = [
    { title: "Parents", ids: hood.parents.map((n) => n.thoughtId) },
    { title: "Children", ids: hood.children.map((n) => n.thoughtId) },
    { title: "Jumps", ids: hood.jumps.map((n) => n.thoughtId) },
    { title: "Siblings", ids: hood.siblings },
  ].filter((group) => group.ids.length > 0);

  if (groups.length === 0) {
    return (
      <p className="px-4 py-3 text-[0.8125rem] text-ink-muted">
        Not linked to anything yet. Use ⋯ to add a child, parent or jump.
      </p>
    );
  }

  return (
    <div className="flex-none border-b border-rule">
      {groups.map((group) => (
        <section key={group.title}>
          <h3 className="bg-surface-raised px-4 py-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-muted">
            {group.title}
          </h3>
          <ul className="divide-y divide-rule">
            {group.ids.map((id) => {
              const thought = thoughts[id];
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => onOpen(id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      onMenu(id, event);
                    }}
                    className="flex min-h-tap w-full items-center gap-3 px-4 py-2 text-left text-[0.9375rem] text-ink active:bg-surface-raised"
                  >
                    <span
                      className="size-3 flex-none rounded-full"
                      style={{ background: typeColor(thought?.color ?? null) }}
                    />
                    <span className="truncate">{thought?.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
