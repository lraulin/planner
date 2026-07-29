"use client";

import { useMemo, useState } from "react";
import {
  commitmentPercent,
  suggestCommitment,
  summarizeBudget,
} from "@/lib/planning/budget";
import { selectProjectsForCommitment } from "@/lib/planning/review";
import { formatEffort, parseEffort } from "@/lib/tree/format";
import type { StepContext } from "./types";

type Props = {
  ctx: StepContext;
  availableMinutes: number | null;
  onAvailableChange: (minutes: number | null) => void;
};

/**
 * Step 4 — set the week's available time and a commitment per leaf project.
 * Resources are out of scope; one budget for the whole week.
 */
export function TimeBudgetStep({ ctx, availableMinutes, onAvailableChange }: Props) {
  const projects = useMemo(() => selectProjectsForCommitment(ctx.nodes), [ctx.nodes]);

  const rows = useMemo(
    () =>
      projects.map((p) => ({
        nodeId: p.id,
        effortLeftMinutes: p.effortLeftRollupMinutes,
        committedMinutes: ctx.entryFor(p.id).committedMinutes,
      })),
    // entryFor is stable via entries identity for render purposes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projects, ctx.entries],
  );

  const summary = useMemo(
    () => summarizeBudget(rows, availableMinutes),
    [rows, availableMinutes],
  );

  const [availableText, setAvailableText] = useState(
    formatEffort(availableMinutes) || (availableMinutes === 0 ? "0" : ""),
  );
  const [prevAvailable, setPrevAvailable] = useState(availableMinutes);
  if (availableMinutes !== prevAvailable) {
    setPrevAvailable(availableMinutes);
    setAvailableText(
      formatEffort(availableMinutes) || (availableMinutes === 0 ? "0" : ""),
    );
  }

  function commitAvailable() {
    const parsed = parseEffort(availableText);
    if (parsed === undefined) {
      setAvailableText(
        formatEffort(availableMinutes) || (availableMinutes === 0 ? "0" : ""),
      );
      return;
    }
    onAvailableChange(parsed);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
            Available Time
          </span>
          <input
            type="text"
            className="w-32 rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] tabular text-ink outline-none focus:border-select-edge"
            value={availableText}
            placeholder="40 h"
            onChange={(e) => setAvailableText(e.target.value)}
            onBlur={commitAvailable}
          />
        </label>
        <div
          className={`flex flex-wrap gap-4 text-[0.8125rem] tabular ${
            summary.overCommitted ? "text-priority-a" : "text-ink-muted"
          }`}
        >
          <span>
            Total Committed:{" "}
            <strong className="text-ink">
              {formatEffort(summary.committedMinutes) || "0"}
            </strong>
          </span>
          <span>
            Time Left:{" "}
            <strong className="text-ink">
              {summary.remainingMinutes == null
                ? "—"
                : formatEffort(summary.remainingMinutes) || "0"}
            </strong>
          </span>
          {summary.percentCommitted != null && (
            <span>{summary.percentCommitted}% committed</span>
          )}
          {summary.overCommitted && <span className="font-medium">Over-committed</span>}
        </div>
      </div>

      {projects.length === 0 ? (
        <p className="text-[0.875rem] text-ink-muted">
          No open leaf projects to commit time to.
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto rounded border border-rule">
          <table className="w-full border-collapse text-[0.8125rem]">
            <thead className="sticky top-0 bg-shell text-left text-ink-muted">
              <tr className="border-b border-rule">
                <th className="px-2 py-1.5 font-medium">P</th>
                <th className="px-2 py-1.5 font-medium">Project</th>
                <th className="px-2 py-1.5 font-medium">Effort Left</th>
                <th className="px-2 py-1.5 font-medium">Time Committed</th>
                <th className="px-2 py-1.5 font-medium">Time %</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <CommitmentRow
                  key={p.id}
                  name={p.name || "Untitled"}
                  priority={p.priorityLetter}
                  effortLeft={p.effortLeftRollupMinutes}
                  committed={ctx.entryFor(p.id).committedMinutes}
                  available={availableMinutes}
                  onCommit={(minutes) =>
                    ctx.patchEntry(p.id, { committedMinutes: minutes, reviewed: true })
                  }
                  onSuggest={() => {
                    const suggested = suggestCommitment(
                      p.effortLeftRollupMinutes,
                      availableMinutes,
                    );
                    ctx.patchEntry(p.id, {
                      committedMinutes: suggested > 0 ? suggested : null,
                      reviewed: true,
                    });
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CommitmentRow({
  name,
  priority,
  effortLeft,
  committed,
  available,
  onCommit,
  onSuggest,
}: {
  name: string;
  priority: string | null;
  effortLeft: number | null;
  committed: number | null;
  available: number | null;
  onCommit: (minutes: number | null) => void;
  onSuggest: () => void;
}) {
  const [text, setText] = useState(
    formatEffort(committed) || (committed === 0 ? "0" : ""),
  );
  const [prev, setPrev] = useState(committed);
  if (committed !== prev) {
    setPrev(committed);
    setText(formatEffort(committed) || (committed === 0 ? "0" : ""));
  }

  const pct = commitmentPercent(committed, available);

  function blur() {
    const parsed = parseEffort(text);
    if (parsed === undefined) {
      setText(formatEffort(committed) || (committed === 0 ? "0" : ""));
      return;
    }
    onCommit(parsed);
  }

  return (
    <tr className="border-b border-rule/60 hover:bg-surface-raised/50">
      <td className="px-2 py-1.5 tabular text-ink-faint">{priority ?? "·"}</td>
      <td className="px-2 py-1.5 text-ink">{name}</td>
      <td className="px-2 py-1.5 tabular text-ink-muted">
        {formatEffort(effortLeft) || "—"}
      </td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1">
          <input
            type="text"
            className="w-20 rounded border border-rule bg-surface px-1.5 py-0.5 tabular text-ink outline-none focus:border-select-edge"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={blur}
          />
          {committed == null && (
            <button
              type="button"
              className="text-[0.75rem] text-ink-faint hover:text-ink-muted"
              onClick={onSuggest}
              title="Suggest from effort left"
            >
              Suggest
            </button>
          )}
        </div>
      </td>
      <td className="px-2 py-1.5 tabular text-ink-muted">
        {pct == null ? "—" : `${pct}%`}
      </td>
    </tr>
  );
}
