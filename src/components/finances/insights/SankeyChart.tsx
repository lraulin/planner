"use client";

import { useMemo, useState } from "react";
import { sankey, sankeyLinkHorizontal } from "d3-sankey";
import type { InsightsDrill } from "@/lib/finances/insightsFilter";
import { formatUsd } from "@/lib/finances/money";
import {
  sankeyNodeDrill,
  type SankeyLink,
  type SankeyModel,
  type SankeyNode,
} from "@/lib/finances/sankeyFlow";
import { useIsCompact } from "@/components/shell/useIsCompact";
import { chartCatVar } from "./chartColors";

const WIDTH = 640;
const HEIGHT = 280;

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

export function SankeyChart({
  model,
  onSelect,
}: {
  model: SankeyModel;
  onSelect?: (drill: InsightsDrill) => void;
}) {
  const compact = useIsCompact() ?? false;
  const [hovered, setHovered] = useState<string | null>(null);
  const fontSize = compact ? 13 : 10;

  const graph = useMemo(() => {
    const nodes = model.nodes.filter((node) => node.cents > 0);
    const ids = new Set(nodes.map((node) => node.id));
    const links = model.links.filter(
      (link) => link.cents > 0 && ids.has(link.source) && ids.has(link.target),
    );
    if (nodes.length === 0 || links.length === 0) return null;

    const layout = sankey<LayoutNode, LayoutLink>()
      .nodeId((node) => node.id)
      .nodeWidth(14)
      .nodePadding(compact ? 18 : 12)
      .extent([
        [4, 8],
        [WIDTH - 132, HEIGHT - 8],
      ]);

    return layout({
      nodes: nodes.map((node) => ({ ...node })),
      links: links.map((link) => ({
        ...link,
        value: link.cents,
      })),
    });
  }, [model, compact]);

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
    <div className="relative min-w-0">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
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
              className="cursor-pointer"
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse") setHovered(id);
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === "mouse") setHovered(null);
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
                setHovered(id);
                const drill = sankeyNodeDrill(target.id) ?? sankeyNodeDrill(source.id);
                if (drill) onSelect?.(drill);
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
              className="cursor-pointer"
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse") setHovered(node.id);
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === "mouse") setHovered(null);
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
                setHovered(node.id);
                const drill = sankeyNodeDrill(node.id);
                if (drill) onSelect?.(drill);
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
                x={node.x1 + 4}
                y={(node.y0 + node.y1) / 2}
                textAnchor="start"
                dominantBaseline="middle"
                className="fill-ink"
                style={{ fontSize }}
              >
                {node.label}
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
