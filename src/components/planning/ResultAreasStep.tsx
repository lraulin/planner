"use client";

import { useMemo, useState } from "react";
import { selectResultAreasForReview } from "@/lib/planning/review";
import { asyncHandler } from "@/lib/eventHandler";
import type { StepContext } from "./types";

type Props = {
  ctx: StepContext;
  onFocus: (nodeId: string, focus: boolean) => Promise<void>;
  onMission: (nodeId: string, mission: string) => Promise<void>;
};

/**
 * Step 1 — walk each Result Area: mission, guiding principles, focus toggle.
 * One area at a time with Prev/Next area, matching Achieve's page-through feel without
 * the Windows-era pager chrome.
 */
export function ResultAreasStep({ ctx, onFocus, onMission }: Props) {
  const areas = useMemo(() => selectResultAreasForReview(ctx.nodes), [ctx.nodes]);
  const [index, setIndex] = useState(0);
  const area = areas[index] ?? null;
  const review = area ? ctx.resultAreaReviews.get(area.id) : null;
  const entry = area ? ctx.entryFor(area.id) : null;

  const [missionDraft, setMissionDraft] = useState(review?.mission ?? "");
  const [prevAreaId, setPrevAreaId] = useState(area?.id ?? null);
  if (area && area.id !== prevAreaId) {
    setPrevAreaId(area.id);
    setMissionDraft(review?.mission ?? "");
  }

  const children = useMemo(() => {
    if (!area) return [];
    return ctx.nodes.filter(
      (n) =>
        n.parentId === area.id &&
        (n.type === "project" || n.type === "goal") &&
        n.state !== "completed" &&
        n.state !== "cancelled",
    );
  }, [area, ctx.nodes]);

  if (areas.length === 0) {
    return (
      <div className="p-6 text-[0.875rem] text-ink-muted">
        No Result Areas to review. Add one on the Outline, then come back.
      </div>
    );
  }

  if (!area || !entry) return null;

  async function saveMission() {
    if (!area) return;
    const trimmed = missionDraft.trim();
    if (trimmed === (review?.mission ?? "").trim()) return;
    await onMission(area.id, missionDraft);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[0.875rem] text-ink">
          <span className="text-ink-muted">Result Area:</span>
          <select
            className="rounded border border-rule bg-surface px-2 py-1 text-ink outline-none focus:border-select-edge"
            value={area.id}
            onChange={(e) => {
              const next = areas.findIndex((a) => a.id === e.target.value);
              if (next >= 0) setIndex(next);
            }}
          >
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name || "Untitled"}
              </option>
            ))}
          </select>
        </label>
        <span className="text-[0.75rem] tabular text-ink-faint">
          {index + 1} of {areas.length}
        </span>
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            disabled={index === 0}
            className="rounded border border-rule bg-surface px-2 py-1 text-[0.8125rem] text-ink hover:bg-surface-raised disabled:opacity-40"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
          >
            Previous
          </button>
          <button
            type="button"
            disabled={index >= areas.length - 1}
            className="rounded border border-rule bg-surface px-2 py-1 text-[0.8125rem] text-ink hover:bg-surface-raised disabled:opacity-40"
            onClick={() => setIndex((i) => Math.min(areas.length - 1, i + 1))}
          >
            Next Area
          </button>
        </div>
      </div>

      {review?.description ? (
        <p className="text-[0.8125rem] text-ink-muted">{review.description}</p>
      ) : null}

      <label className="flex flex-col gap-1">
        <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
          Mission
        </span>
        <textarea
          className="min-h-[8rem] w-full resize-y rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] text-ink outline-none focus:border-select-edge"
          value={missionDraft}
          onChange={(e) => setMissionDraft(e.target.value)}
          onBlur={asyncHandler(saveMission, ctx.onError)}
        />
      </label>

      <div>
        <div className="mb-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
          Guiding Principles
        </div>
        {review && review.principles.length > 0 ? (
          <table className="w-full border-collapse text-[0.8125rem]">
            <thead>
              <tr className="border-b border-rule text-left text-ink-muted">
                <th className="px-2 py-1 font-medium">Title</th>
                <th className="px-2 py-1 font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {review.principles.map((p) => (
                <tr key={p.id} className="border-b border-rule/60">
                  <td className="px-2 py-1.5 text-ink">{p.title || "—"}</td>
                  <td className="px-2 py-1.5 text-ink-muted">{p.description || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-[0.8125rem] text-ink-faint">No guiding principles yet.</p>
        )}
      </div>

      <label className="flex items-center gap-2 text-[0.875rem] text-ink">
        <input
          type="checkbox"
          checked={entry.focus}
          onChange={(e) => {
            void onFocus(area.id, e.target.checked);
          }}
        />
        Make this a Focus Area for this week
      </label>

      {children.length > 0 && (
        <div>
          <div className="mb-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
            Projects &amp; Goals
          </div>
          <ul className="divide-y divide-rule rounded border border-rule text-[0.8125rem]">
            {children.map((child) => (
              <li key={child.id} className="flex items-center gap-2 px-2 py-1.5">
                <span className="w-6 tabular text-ink-faint">
                  {child.priorityLetter ?? "·"}
                </span>
                <span className="text-ink">{child.name || "Untitled"}</span>
                <span className="ml-auto text-ink-faint">
                  {child.type === "goal" ? "Goal" : "Project"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
