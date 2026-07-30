"use client";

import { useState, useTransition } from "react";
import { createExerciseAction, updateExerciseAction } from "@/app/fitness/actions";
import { Drawer } from "@/components/detail/Drawer";
import { BAR_PRESETS, barPresetId, parseBarWeight } from "@/lib/fitness/bars";
import {
  allowsUnilateral,
  coerceExercisePrefs,
  EQUIPMENT_OPTIONS,
} from "@/lib/fitness/equipment";
import type { ExerciseEquipment, ExerciseSummary } from "@/lib/fitness/types";

type Draft = {
  name: string;
  notes: string;
  equipment: ExerciseEquipment;
  barWeight: number;
  unilateral: boolean;
};

function toDraft(exercise: ExerciseSummary | null): Draft {
  if (!exercise) {
    return {
      name: "",
      notes: "",
      equipment: "barbell",
      barWeight: 45,
      unilateral: false,
    };
  }
  return {
    name: exercise.name,
    notes: exercise.notes,
    equipment: exercise.equipment,
    barWeight: exercise.barWeight,
    unilateral: exercise.unilateral,
  };
}

/**
 * Catalog exercise config drawer — equipment, bar, unilateral.
 * Shared by Exercises tab and session “New/Edit exercise”.
 */
export function ExerciseEditor({
  open,
  exercise,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** null = create new */
  exercise: ExerciseSummary | null;
  onClose: () => void;
  onSaved: (exercise: ExerciseSummary) => void;
}) {
  return (
    <Drawer open={open} onClose={onClose} labelledBy="exercise-editor-title">
      {open && (
        <ExerciseForm
          key={exercise?.id ?? "new"}
          exercise={exercise}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </Drawer>
  );
}

function ExerciseForm({
  exercise,
  onClose,
  onSaved,
}: {
  exercise: ExerciseSummary | null;
  onClose: () => void;
  onSaved: (exercise: ExerciseSummary) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(exercise));
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function patch(partial: Partial<Draft>) {
    setDraft((current) => {
      const next = { ...current, ...partial };
      if (partial.equipment !== undefined) {
        const coerced = coerceExercisePrefs({
          equipment: next.equipment,
          barWeight: next.barWeight,
          unilateral: next.unilateral,
        });
        return { ...next, ...coerced };
      }
      return next;
    });
  }

  function handleSave() {
    setError(null);
    const name = draft.name.trim();
    if (!name) {
      setError("Name is required.");
      return;
    }
    const prefs = coerceExercisePrefs({
      equipment: draft.equipment,
      barWeight: draft.barWeight,
      unilateral: draft.unilateral,
    });

    startTransition(async () => {
      if (exercise) {
        const result = await updateExerciseAction(exercise.id, {
          name,
          notes: draft.notes,
          ...prefs,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onSaved({
          ...exercise,
          name,
          notes: draft.notes,
          equipment: prefs.equipment,
          barWeight: prefs.barWeight,
          unilateral: prefs.unilateral,
          updatedAt: new Date(),
        });
      } else {
        const result = await createExerciseAction(name, {
          notes: draft.notes,
          ...prefs,
        });
        if (!result.ok || !result.id) {
          setError(result.ok ? "Missing id" : result.error);
          return;
        }
        onSaved({
          id: result.id,
          name,
          notes: draft.notes,
          equipment: prefs.equipment,
          barWeight: prefs.barWeight,
          unilateral: prefs.unilateral,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    });
  }

  const barSelect = barPresetId(draft.barWeight);

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-none items-center justify-between gap-3 border-b border-rule px-4 py-3">
        <h2 id="exercise-editor-title" className="text-sm font-semibold text-ink">
          {exercise ? "Edit exercise" : "New exercise"}
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-rule px-3 py-1 text-[0.8125rem] text-ink-muted hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleSave}
            className="rounded bg-ink px-3 py-1 text-[0.8125rem] font-medium text-surface disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {error && (
          <p className="rounded border border-priority-a/40 bg-priority-a/10 px-3 py-2 text-[0.8125rem] text-priority-a">
            {error}
          </p>
        )}

        <label className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
          Name
          <input
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="Bench Press"
            className="rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] text-ink normal-case tracking-normal"
            autoFocus
          />
        </label>

        <fieldset className="space-y-2">
          <legend className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
            Equipment
          </legend>
          <div className="flex flex-wrap gap-2">
            {EQUIPMENT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => patch({ equipment: opt.value })}
                className={`rounded border px-3 py-1.5 text-[0.8125rem] ${
                  draft.equipment === opt.value
                    ? "border-ink bg-ink text-surface"
                    : "border-rule text-ink-muted hover:text-ink"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </fieldset>

        {draft.equipment === "barbell" && (
          <label className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
            Bar
            <select
              value={barSelect === "custom" ? "custom" : String(draft.barWeight)}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "custom") {
                  const raw = window.prompt("Bar weight (lb)", String(draft.barWeight));
                  if (raw == null) return;
                  patch({ barWeight: parseBarWeight(raw) });
                  return;
                }
                patch({ barWeight: parseBarWeight(v) });
              }}
              className="rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] text-ink normal-case tracking-normal"
            >
              {BAR_PRESETS.filter((p) => p.id !== "none").map((p) => (
                <option key={p.id} value={String(p.weight)}>
                  {p.label}
                </option>
              ))}
              <option value="custom">
                Custom
                {barSelect === "custom" ? ` (${draft.barWeight} lb)` : "…"}
              </option>
            </select>
          </label>
        )}

        {allowsUnilateral(draft.equipment) && (
          <label className="flex items-center gap-2 text-[0.875rem] text-ink">
            <input
              type="checkbox"
              checked={draft.unilateral}
              onChange={(e) => patch({ unilateral: e.target.checked })}
              className="rounded border-rule"
            />
            <span>
              Each side separately
              <span className="mt-0.5 block text-[0.75rem] text-ink-faint">
                Log left and right reps when they differ.
              </span>
            </span>
          </label>
        )}

        <label className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
          Notes
          <textarea
            value={draft.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            rows={3}
            className="rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] text-ink normal-case tracking-normal"
          />
        </label>
      </div>
    </div>
  );
}
