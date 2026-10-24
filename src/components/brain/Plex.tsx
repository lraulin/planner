"use client";

import { useMemo, useState, type MouseEvent } from "react";
import { neighbourhood } from "@/lib/brain/neighbourhood";
import { layoutPlex, type PlexNode } from "@/lib/brain/plex";
import type { PlexData } from "@/lib/brain/types";
import { useElementSize } from "@/components/useElementSize";
import { ThoughtChip } from "./ThoughtChip";

/**
 * The plex: the active thought in the centre, parents above, children below, jumps left,
 * siblings right. Layout is pure (`src/lib/brain/plex.ts`); this draws it.
 *
 * Chips are absolutely positioned and keyed by thought id, so recentring is a CSS transition
 * rather than a remount. Edges are SVG underneath; they fade in rather than slide, since an
 * SVG endpoint cannot be transitioned portably.
 */
export function Plex({
  plex,
  onOpen,
  onMenu,
  onMore,
}: {
  plex: PlexData;
  onOpen: (thoughtId: string) => void;
  onMenu: (thoughtId: string, event: MouseEvent) => void;
  /** The thoughts a "+N more" chip stands for, with the chip's own position. */
  onMore: (hiddenIds: string[], node: PlexNode, event: MouseEvent) => void;
}) {
  const { ref, size } = useElementSize<HTMLDivElement>();
  const [hoverLink, setHoverLink] = useState<string | null>(null);
  const activeId = plex.active.id;

  const hood = useMemo(
    () => neighbourhood(activeId, plex.links),
    [activeId, plex.links],
  );
  const layout = useMemo(
    () =>
      size
        ? layoutPlex(activeId, hood, { width: size.width, height: size.height })
        : null,
    [activeId, hood, size],
  );

  const labels = useMemo(
    () => new Map(plex.links.map((l) => [l.id, l.label])),
    [plex.links],
  );

  const hiddenFor = (zone: PlexNode["zone"]): string[] => {
    const all =
      zone === "parents"
        ? hood.parents.map((n) => n.thoughtId)
        : zone === "children"
          ? hood.children.map((n) => n.thoughtId)
          : zone === "jumps"
            ? hood.jumps.map((n) => n.thoughtId)
            : hood.siblings;
    const shown = new Set(
      (layout?.nodes ?? [])
        .filter((n) => n.zone === zone && n.more === undefined)
        .map((n) => n.key),
    );
    return all.filter((id) => !shown.has(id));
  };

  return (
    <div ref={ref} className="relative min-h-0 flex-1 overflow-hidden">
      {layout && (
        <>
          <svg
            className="pointer-events-none absolute inset-0 size-full"
            aria-hidden="true"
          >
            {layout.edges.map((edge) => {
              const label = labels.get(edge.linkId) ?? "";
              const hovered = hoverLink === edge.linkId;
              return (
                <g
                  key={edge.key}
                  className="animate-[nav-dim_250ms_ease-out] motion-reduce:animate-none"
                >
                  <line
                    x1={edge.x1}
                    y1={edge.y1}
                    x2={edge.x2}
                    y2={edge.y2}
                    stroke="var(--rule-strong)"
                    strokeWidth={hovered ? 2.5 : 1.5}
                  />
                  <line
                    x1={edge.x1}
                    y1={edge.y1}
                    x2={edge.x2}
                    y2={edge.y2}
                    stroke="transparent"
                    strokeWidth={12}
                    className="pointer-events-auto"
                    onMouseEnter={() => setHoverLink(edge.linkId)}
                    onMouseLeave={() => setHoverLink(null)}
                  >
                    {label && <title>{label}</title>}
                  </line>
                  {label && (
                    <text
                      x={(edge.x1 + edge.x2) / 2}
                      y={(edge.y1 + edge.y2) / 2 - 4}
                      textAnchor="middle"
                      className={`pointer-events-none fill-ink-muted text-[0.6875rem] ${
                        hovered ? "font-semibold" : ""
                      }`}
                    >
                      {label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {layout.nodes.map((node) => {
            const thought = plex.thoughts[node.key];
            return (
              <ThoughtChip
                key={node.key}
                node={node}
                name={thought?.name ?? ""}
                color={thought?.color ?? null}
                onOpen={(event) => {
                  if (node.more !== undefined)
                    onMore(hiddenFor(node.zone), node, event);
                  else if (node.zone !== "centre") onOpen(node.key);
                }}
                onMenu={(event) => {
                  event.preventDefault();
                  if (node.more === undefined) onMenu(node.key, event);
                }}
              />
            );
          })}
        </>
      )}
    </div>
  );
}
