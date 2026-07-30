"use client";

import { useMemo, useState } from "react";
import { Draggable } from "@fullcalendar/interaction";
import { useEffect, useRef } from "react";
import type { OutlineNode } from "@/lib/tree/types";
import { TypeIcon } from "@/components/icons/TypeIcon";

type Props = {
  nodes: OutlineNode[];
};

export function ProjectsRail({ nodes }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [groupByArea, setGroupByArea] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [sortByPriority, setSortByPriority] = useState(false);

  const projects = useMemo(() => {
    let list = nodes.filter(
      (n) =>
        !n.hidden &&
        (n.type === "project" || (showTasks && n.type === "task")) &&
        (showCompleted || (n.state !== "completed" && n.state !== "cancelled")),
    );

    if (sortByPriority) {
      list = [...list].sort((a, b) => {
        const la = a.lapLetter ?? "Z";
        const lb = b.lapLetter ?? "Z";
        if (la !== lb) return la.localeCompare(lb);
        return (a.lapRank ?? 99) - (b.lapRank ?? 99);
      });
    }

    return list;
  }, [nodes, showCompleted, showTasks, sortByPriority]);

  const grouped = useMemo(() => {
    if (!groupByArea) return [{ label: null as string | null, items: projects }];

    function areaName(node: OutlineNode): string {
      let cur: OutlineNode | undefined = node;
      const byId = new Map(nodes.map((n) => [n.id, n]));
      while (cur) {
        if (cur.type === "result_area") return cur.name || "Untitled";
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
      return "(No Result Area)";
    }

    const map = new Map<string, OutlineNode[]>();
    for (const p of projects) {
      const key = areaName(p);
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return [...map.entries()].map(([label, items]) => ({ label, items }));
  }, [projects, groupByArea, nodes]);

  // FullCalendar external drag source
  useEffect(() => {
    if (!listRef.current) return;
    const draggable = new Draggable(listRef.current, {
      itemSelector: "[data-project-id]",
      eventData(el) {
        return {
          title: el.getAttribute("data-project-name") ?? "Project",
          duration: { minutes: Number(el.getAttribute("data-duration") ?? 60) },
          create: true,
          extendedProps: {
            projectId: el.getAttribute("data-project-id"),
            durationMinutes: Number(el.getAttribute("data-duration") ?? 60),
          },
        };
      },
    });
    return () => draggable.destroy();
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-rule px-2 py-1.5 text-[0.8125rem] font-medium text-ink">
        Projects
      </div>
      <div className="flex flex-col gap-1 border-b border-rule px-2 py-1.5 text-[0.75rem] text-ink-muted">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
          />
          Show Completed
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={groupByArea}
            onChange={(e) => setGroupByArea(e.target.checked)}
          />
          Group by Result Area
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={showTasks}
            onChange={(e) => setShowTasks(e.target.checked)}
          />
          Show Tasks
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={sortByPriority}
            onChange={(e) => setSortByPriority(e.target.checked)}
          />
          Sort by Priority
        </label>
      </div>
      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto p-1 text-[0.8125rem]"
      >
        {grouped.map((group) => (
          <div key={group.label ?? "_all"} className="mb-1">
            {group.label && (
              <div className="px-1 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
                {group.label}
              </div>
            )}
            {group.items.map((p) => {
              const duration =
                p.type === "task" && p.effortLeftMinutes
                  ? Math.min(Math.max(p.effortLeftMinutes, 15), 4 * 60)
                  : 60;
              return (
                <div
                  key={p.id}
                  data-project-id={p.id}
                  data-project-name={p.name || "Untitled"}
                  data-duration={duration}
                  className="mb-0.5 flex cursor-grab items-center gap-2 rounded border border-transparent px-1 py-0.5 hover:border-rule hover:bg-surface active:cursor-grabbing"
                  title="Drag onto the week to schedule"
                >
                  <TypeIcon kind={p.type} className="h-3.5 w-3.5 flex-none" />
                  <span className="min-w-0 flex-1 truncate leading-snug text-ink">
                    {p.name || "Untitled"}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
        {projects.length === 0 && (
          <p className="px-1 py-2 text-ink-faint">No projects to show.</p>
        )}
      </div>
    </div>
  );
}
