"use client";

import { useMemo, useState } from "react";
import { sankey, sankeyLinkHorizontal } from "d3-sankey";
import { formatUsd, formatUsdCompact } from "@/lib/finances/money";
import type { SankeyLink, SankeyModel, SankeyNode } from "@/lib/finances/sankeyFlow";
import { useIsCompact } from "@/components/shell/useIsCompact";
import { useElementSize } from "@/components/useElementSize";
import { chartCatVar } from "./chartColors";

/** Until the container is measured; then the drawing uses its real pixels. */
const FALLBACK_WIDTH = 640;
/** Vertical room per node in the busiest column, so labels never stack on each other. */
const ROW_HEIGHT = 30;
const MIN_HEIGHT = 200;
/** Average glyph width as a fraction of the font size — enough to reserve label gutters. */
const GLYPH_WIDTH = 0.6;

type LayoutNode = SankeyNode & {
  x0?: number;
  x1?: number;
  y0?: number;
  y1?: number;
};

type LayoutLink = SankeyLink & {
  source: LayoutNode | string;
  target: LayoutNode | string;
  value: number;
  width?: number;
  y0?: number;
  y1?: number;
};

function nodeColor(node: SankeyNode, sinkIndex: Map<string, number>): string {
  if (node.stage === "source") return "var(--chart-income)";
  if (node.stage === "middle") return "var(--chart-average)";
  return chartCatVar(sinkIndex.get(node.id) ?? 7);
}

function nodeOf(end: LayoutLink["source"]): LayoutNode | null {
  return typeof end === "object" ? end : null;
}

function nodeLabel(node: SankeyNode): string {
  return `${node.label} ${formatUsdCompact(node.cents)}`;
}

/** The name cut to what fits beside its amount in `room` pixels; the amount always shows. */
function fittedName(node: SankeyNode, room: number, fontSize: number): string {
  const chars = Math.floor((room - 8) / (fontSize * GLYPH_WIDTH));
  const nameChars = chars - formatUsdCompact(node.cents).length - 1;
  if (node.label.length <= nameChars) return node.label;
  return `${node.label.slice(0, Math.max(1, nameChars - 1))}…`;
}

/**
 * Drawn in the container's own pixels rather than a stretched viewBox: a fixed 640-wide
 * drawing scaled to a 1900px pane tripled every label, and at that size the sink column ran
 * them into each other.
 */
export function SankeyChart({ model }: { model: SankeyModel }) {
  const compact = useIsCompact() ?? false;
  const { ref, size } = useElementSize<HTMLDivElement>();
  const [hovered, setHovered] = useState<string | null>(null);
  const fontSize = compact ? 13 : 12;
  const width = size?.width || FALLBACK_WIDTH;

  const graph = useMemo(() => {
    const nodes = model.nodes.filter((node) => node.cents > 0);
    const ids = new Set(nodes.map((node) => node.id));
    const links = model.links.filter(
      (link) => link.cents > 0 && ids.has(link.source) && ids.has(link.target),
    );
    if (nodes.length === 0 || links.length === 0) return null;

    const gutter = (stage: SankeyNode["stage"]) =>
      Math.min(
        width * 0.3,
        Math.max(
          0,
          ...nodes
            .filter((node) => node.stage === stage)
            .map((node) => nodeLabel(node).length * fontSize * GLYPH_WIDTH + 8),
        ),
      );
    const sourceGutter = gutter("source");
    const sinkGutter = gutter("sink");
    const busiest = Math.max(
      ...(["source", "middle", "sink"] as const).map(
        (stage) => nodes.filter((node) => node.stage === stage).length,
      ),
    );
    const height = Math.max(MIN_HEIGHT, busiest * ROW_HEIGHT);

    const layout = sankey<LayoutNode, LayoutLink>()
      .nodeId((node) => node.id)
      .nodeWidth(14)
      .nodePadding(compact ? 18 : 12)
      .extent([
        [sourceGutter, 8],
        [width - sinkGutter, height - 8],
      ]);

    return {
      height,
      sourceGutter,
      sinkGutter,
      ...layout({
        nodes: nodes.map((node) => ({ ...node })),
        links: links.map((link) => ({
          ...link,
          value: link.cents,
        })),
      }),
    };
  }, [model, compact, width, fontSize]);

  if (!graph) {
    return (
      <p className="rounded border border-dashed border-rule px-3 py-6 text-center text-[0.8125rem] text-ink-muted">
        Not enough income and spend in this window to draw a flow.
      </p>
    );
  }

  const sinkIndex = new Map<string, number>();
  graph.nodes
    .filter((node) => node.stage === "sink")
    .forEach((node, index) => sinkIndex.set(node.id, index));

  const path = sankeyLinkHorizontal<LayoutNode, LayoutLink>();
  const hoveredNode = graph.nodes.find((node) => node.id === hovered) ?? null;
  const hoveredLink = graph.links.find(
    (link) => `${nodeOf(link.source)?.id}->${nodeOf(link.target)?.id}` === hovered,
  );

  return (
    <div ref={ref} className="relative min-w-0">
      <svg
        width={width}
        height={graph.height}
        className="block"
        role="img"
        aria-label="Cash flow from income sources through spent or kept into categories"
      >
        {graph.links.map((link) => {
          const source = nodeOf(link.source);
          const target = nodeOf(link.target);
          if (!source || !target) return null;
          const id = `${source.id}->${target.id}`;
          const d = path(link);
          if (!d) return null;
          return (
            <path
              key={id}
              d={d}
              fill="none"
              stroke={nodeColor(source, sinkIndex)}
              strokeOpacity={
                hovered === id || hovered === source.id || hovered === target.id
                  ? 0.55
                  : 0.28
              }
              strokeWidth={Math.max(2, link.width ?? 2)}
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse") setHovered(id);
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === "mouse") setHovered(null);
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
                setHovered(id);
              }}
            />
          );
        })}
        {graph.nodes.map((node) => {
          if (
            node.x0 === undefined ||
            node.x1 === undefined ||
            node.y0 === undefined ||
            node.y1 === undefined
          ) {
            return null;
          }
          const width = Math.max(1, node.x1 - node.x0);
          const height = Math.max(1, node.y1 - node.y0);
          return (
            <g
              key={node.id}
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse") setHovered(node.id);
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === "mouse") setHovered(null);
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
                setHovered(node.id);
              }}
            >
              <rect
                x={node.x0}
                y={node.y0}
                width={width}
                height={height}
                fill={nodeColor(node, sinkIndex)}
                rx={2}
              />
              <text
                x={node.stage === "source" ? node.x0 - 4 : node.x1 + 4}
                y={(node.y0 + node.y1) / 2}
                textAnchor={node.stage === "source" ? "end" : "start"}
                dominantBaseline="middle"
                className="fill-ink"
                style={{ fontSize }}
              >
                {node.stage === "middle"
                  ? node.label
                  : fittedName(
                      node,
                      node.stage === "source" ? graph.sourceGutter : graph.sinkGutter,
                      fontSize,
                    )}{" "}
                <tspan className="fill-ink-muted">{formatUsdCompact(node.cents)}</tspan>
              </text>
            </g>
          );
        })}
      </svg>
      {(hoveredNode || hoveredLink) && (
        <div className="pointer-events-none absolute top-1 left-1/2 z-10 -translate-x-1/2 rounded border border-rule bg-surface-raised px-2 py-1 text-[0.6875rem] whitespace-nowrap text-ink shadow-sm">
          {hoveredNode && (
            <>
              <div className="font-medium">{hoveredNode.label}</div>
              <div>{formatUsd(hoveredNode.cents)}</div>
            </>
          )}
          {hoveredLink && !hoveredNode && (
            <>
              <div className="font-medium">
                {nodeOf(hoveredLink.source)?.label} →{" "}
                {nodeOf(hoveredLink.target)?.label}
              </div>
              <div>{formatUsd(hoveredLink.cents)}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
