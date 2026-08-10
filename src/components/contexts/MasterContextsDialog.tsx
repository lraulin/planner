"use client";

import { useId, useState } from "react";
import {
  addMasterContextAction,
  deleteMasterContextAction,
} from "@/app/contexts/actions";
import { ModalShell } from "@/components/detail/ModalShell";
import type { MasterContextOption } from "@/lib/contexts/queries";

export const MASTER_CONTEXTS_CHANGED_EVENT = "planner:master-contexts-changed";

export function MasterContextsDialog({
  open,
  initialContexts,
  onClose,
}: {
  open: boolean;
  initialContexts: readonly MasterContextOption[];
  onClose: () => void;
}) {
  const titleId = useId();
  const [contexts, setContexts] = useState([...initialContexts]);
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!name.trim() || pending) return;
    setPending(true);
    setError(null);
    const result = await addMasterContextAction(name);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const createdId = result.id;
    if (createdId && !contexts.some((context) => context.id === createdId)) {
      setContexts((current) =>
        [...current, { id: createdId, name: name.trim() }].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        ),
      );
    }
    setSelectedId(createdId ?? null);
    setName("");
    window.dispatchEvent(new Event(MASTER_CONTEXTS_CHANGED_EVENT));
  }

  async function remove() {
    if (!selectedId || pending) return;
    setPending(true);
    setError(null);
    const result = await deleteMasterContextAction(selectedId);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setContexts((current) => current.filter((context) => context.id !== selectedId));
    setSelectedId(null);
    window.dispatchEvent(new Event(MASTER_CONTEXTS_CHANGED_EVENT));
  }

  return (
    <ModalShell open={open} onClose={onClose} labelledBy={titleId} width="max-w-sm">
      <div className="p-5">
        <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
          Master Contexts
        </h2>
        <p className="mt-1 text-[0.8125rem] text-ink-muted">
          Maintain the suggestions offered when you tag work. Existing tags are never
          removed from records.
        </p>

        <label className="mt-4 block text-[0.75rem] font-medium text-ink-muted">
          New context
          <div className="mt-1 flex gap-2">
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void add();
                }
              }}
              placeholder="@Home"
              className="min-h-tap min-w-0 flex-1 rounded border border-rule bg-surface px-3 text-[0.8125rem] text-ink outline-none focus:border-select-edge"
            />
            <button
              type="button"
              onClick={() => void add()}
              disabled={pending || !name.trim()}
              className="min-h-tap rounded bg-select-edge px-4 text-[0.8125rem] font-medium text-white disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </label>

        <div className="mt-3 max-h-[42dvh] overflow-y-auto rounded border border-rule">
          {contexts.length === 0 ? (
            <p className="px-3 py-5 text-[0.8125rem] text-ink-muted">
              No master contexts yet. Add the contexts you want offered as suggestions.
            </p>
          ) : (
            contexts.map((context) => (
              <button
                key={context.id}
                type="button"
                onClick={() => setSelectedId(context.id)}
                aria-pressed={selectedId === context.id}
                className={`min-h-tap w-full border-b border-rule px-3 text-left text-[0.8125rem] last:border-b-0 ${
                  selectedId === context.id
                    ? "bg-select/60 text-ink"
                    : "text-ink hover:bg-surface-raised"
                }`}
              >
                {context.name}
              </button>
            ))
          )}
        </div>

        {error && <p className="mt-3 text-[0.75rem] text-priority-a">{error}</p>}

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => void remove()}
            disabled={!selectedId || pending}
            className="min-h-tap rounded border border-priority-a/45 px-3 text-[0.8125rem] text-priority-a hover:bg-priority-a/10 disabled:opacity-35"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-tap rounded bg-select-edge px-4 text-[0.8125rem] font-medium text-white"
          >
            Done
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
