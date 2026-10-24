"use client";

import {
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import {
  bezierPath,
  dropResult,
  moveExceedsThreshold,
  rubberBandPath,
} from "@/lib/brain/drag";
import type { LinkRelation } from "@/lib/brain/links";
import { neighbourhood } from "@/lib/brain/neighbourhood";
import {
  curveMidpoint,
  gatePoint,
  layoutPlex,
  type GateSide,
  type PlexNode,
  type Point,
} from "@/lib/brain/plex";
import { relationForGate } from "@/lib/brain/drag";
import type { PlexData } from "@/lib/brain/types";
import { useElementSize } from "@/components/useElementSize";
import { AddLinkInput } from "./AddLinkInput";
import { ThoughtChip } from "./ThoughtChip";

/** A gate being dragged: the rubber band runs from `from` to `pointer`. */
type Drag = {
  sourceId: string;
  side: GateSide;
  from: Point;
  start: Point;
  pointer: Point;
  moved: boolean;
};

/** A gate drag released over empty canvas: the name input floats at `at`. */
type Pending = {
  sourceId: string;
  side: GateSide;
  from: Point;
  at: Point;
  activeId: string;
};

const INPUT_WIDTH = 288;
/** Room under the input for its suggestion list, which the plex's overflow would clip. */
const INPUT_ROOM = 260;

/**
 * The plex: the active thought in the centre, parents above, children below, jumps left,
 * siblings right. Layout is pure (`src/lib/brain/plex.ts`); this draws it.
 *
 * Labels are absolutely positioned and keyed by thought id, so recentring is a CSS transition
 * rather than a remount. Edges are SVG underneath; they fade in rather than slide, since an
 * SVG endpoint cannot be transitioned portably.
 *
 * Drag a thought's gate onto another thought to link them, or onto empty canvas to make a
 * new one there. The gate names the relation: top = parent, bottom = child, sides = jump.
 */
export function Plex({
  plex,
  onOpen,
  onMenu,
  onMore,
  onLink,
  onCreateLinked,
}: {
  plex: PlexData;
  onOpen: (thoughtId: string) => void;
  onMenu: (thoughtId: string, event: MouseEvent) => void;
  /** The thoughts a "+N more" chip stands for, with the chip's own position. */
  onMore: (hiddenIds: string[], node: PlexNode, event: MouseEvent) => void;
  /** `otherId` is a `relation` of `thoughtId`; an existing pair is relinked in place. */
  onLink: (thoughtId: string, relation: LinkRelation, otherId: string) => void;
  /** Create a thought named `name` that is a `relation` of `thoughtId`. */
  onCreateLinked: (thoughtId: string, relation: LinkRelation, name: string) => void;
}) {
  const { ref, size } = useElementSize<HTMLDivElement>();
  const [hoverLink, setHoverLink] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const activeId = plex.active.id;

  // A different thought closes whatever was half-done on the last one.
  if (pending && pending.activeId !== activeId) setPending(null);

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

  useEffect(() => {
    if (!drag) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrag(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drag]);

  const hiddenFor = (zone: PlexNode["zone"]): string[] => {
    const all =
      zone === "parents"
        ? hood.parents.map((n) => n.thoughtId)
        : zone === "children"
          ? hood.children.map((n) => n.thoughtId)
          : zone === "jumps"
            ? hood.jumps.map((n) => n.thoughtId)
            : hood.siblings.map((s) => s.thoughtId);
    const shown = new Set(
      (layout?.nodes ?? [])
        .filter((n) => n.zone === zone && n.more === undefined)
        .map((n) => n.key),
    );
    return all.filter((id) => !shown.has(id));
  };

  /** The pointer in the plex's own coordinates, which is what the layout is in. */
  const local = (event: PointerEvent<HTMLElement>): Point => {
    const canvas = event.currentTarget.closest("[data-plex-canvas]");
    const rect = canvas?.getBoundingClientRect();
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    };
  };

  const nodeAt = (p: Point): string | null =>
    layout?.nodes.find(
      (n) => p.x >= n.x && p.x <= n.x + n.w && p.y >= n.y && p.y <= n.y + n.h,
    )?.key ?? null;

  const targetOf = drag ? nodeAt(drag.pointer) : null;
  const dropOn =
    drag && drag.moved && targetOf
      ? dropResult(drag.sourceId, drag.side, targetOf, true).kind === "link"
        ? targetOf
        : null
      : null;

  function gateDown(node: PlexNode, side: GateSide, event: PointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = local(event);
    setPending(null);
    setDrag({
      sourceId: node.key,
      side,
      from: gatePoint(node, side),
      start: p,
      pointer: p,
      moved: false,
    });
  }

  function gateMove(event: PointerEvent<HTMLElement>) {
    if (!drag) return;
    const p = local(event);
    setDrag({
      ...drag,
      pointer: p,
      moved: drag.moved || moveExceedsThreshold(drag.start, p),
    });
  }

  function gateUp(event: PointerEvent<HTMLElement>) {
    if (!drag) return;
    const p = local(event);
    const moved = drag.moved || moveExceedsThreshold(drag.start, p);
    const result = dropResult(drag.sourceId, drag.side, nodeAt(p), moved);
    setDrag(null);
    if (result.kind === "link") {
      onLink(result.thoughtId, result.relation, result.otherId);
    } else if (result.kind === "create") {
      setPending({
        sourceId: result.thoughtId,
        side: drag.side,
        from: drag.from,
        at: p,
        activeId,
      });
    }
  }

  const band = drag?.moved ? drag : null;

  return (
    <div
      ref={ref}
      data-plex-canvas=""
      className="relative min-h-0 flex-1 overflow-hidden"
    >
      {layout && (
        <>
          <svg
            className="pointer-events-none absolute inset-0 size-full"
            aria-hidden="true"
          >
            {layout.edges.map((edge) => {
              const label = labels.get(edge.linkId) ?? "";
              const sibling = edge.kind === "sibling";
              const hovered = !sibling && hoverLink === edge.linkId;
              const orientation = edge.kind === "jump" ? "horizontal" : "vertical";
              const d = bezierPath(edge.from, edge.to, orientation);
              const mid = curveMidpoint(edge);
              return (
                <g
                  key={edge.key}
                  className="animate-[nav-dim_250ms_ease-out] motion-reduce:animate-none"
                >
                  <path
                    d={d}
                    fill="none"
                    stroke="var(--rule-strong)"
                    strokeWidth={hovered ? 2.5 : sibling ? 1 : 1.5}
                    strokeOpacity={sibling ? 0.5 : 1}
                  />
                  {!sibling && (
                    <path
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={12}
                      className="pointer-events-auto"
                      onMouseEnter={() => setHoverLink(edge.linkId)}
                      onMouseLeave={() => setHoverLink(null)}
                    >
                      {label && <title>{label}</title>}
                    </path>
                  )}
                  {label && (
                    <text
                      x={mid.x}
                      y={mid.y - 4}
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
            {band && (
              <path
                d={rubberBandPath(band.from, band.side, band.pointer)}
                fill="none"
                stroke="var(--select-edge)"
                strokeWidth={2}
                strokeDasharray="5 4"
              />
            )}
            {pending && (
              <path
                d={rubberBandPath(pending.from, pending.side, pending.at)}
                fill="none"
                stroke="var(--select-edge)"
                strokeWidth={2}
                strokeDasharray="5 4"
              />
            )}
          </svg>

          {layout.nodes.map((node) => {
            const thought = plex.thoughts[node.key];
            return (
              <ThoughtChip
                key={node.key}
                node={node}
                name={thought?.name ?? ""}
                color={thought?.color ?? null}
                gates={node.more === undefined ? thought?.gates : undefined}
                dropTarget={dropOn === node.key}
                onOpen={(event) => {
                  if (node.more !== undefined)
                    onMore(hiddenFor(node.zone), node, event);
                  else if (node.zone !== "centre") onOpen(node.key);
                }}
                onMenu={(event) => {
                  event.preventDefault();
                  if (node.more === undefined) onMenu(node.key, event);
                }}
                onGateDown={(side, event) => gateDown(node, side, event)}
                onGateMove={gateMove}
                onGateUp={gateUp}
                onGateCancel={() => setDrag(null)}
              />
            );
          })}

          {pending && size && (
            <div
              className="absolute z-30"
              style={{
                width: INPUT_WIDTH,
                left: Math.max(0, Math.min(pending.at.x, size.width - INPUT_WIDTH)),
                top: Math.max(0, Math.min(pending.at.y, size.height - INPUT_ROOM)),
              }}
            >
              <AddLinkInput
                relation={relationForGate(pending.side)}
                activeId={pending.sourceId}
                placeholder={`${NOUN[relationForGate(pending.side)]} thought name`}
                cancelOnBlur
                onCancel={() => setPending(null)}
                onChoose={(otherId) => {
                  const p = pending;
                  setPending(null);
                  onLink(p.sourceId, relationForGate(p.side), otherId);
                }}
                onCreate={(name) => {
                  const p = pending;
                  setPending(null);
                  onCreateLinked(p.sourceId, relationForGate(p.side), name);
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

const NOUN: Record<LinkRelation, string> = {
  parent: "Parent",
  child: "Child",
  jump: "Jump",
};
