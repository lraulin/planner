"use client";

import { useId, useState } from "react";
import { ModalShell } from "@/components/detail/ModalShell";
import type { ThoughtType } from "@/lib/brain/types";
import { typeColor } from "./ThoughtChip";

const PALETTE = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * The thought types — a name and a colour each. Deleting one leaves its thoughts untyped,
 * which the confirmation line says.
 */
export function TypesDialog({
  types,
  onCreate,
  onDelete,
  onClose,
}: {
  types: ThoughtType[];
  onCreate: (name: string, color: number) => void;
  onDelete: (typeId: string) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const [name, setName] = useState("");
  const [color, setColor] = useState(0);

  return (
    <ModalShell open onClose={onClose} labelledBy={titleId} width="max-w-md">
      <div className="p-5">
        <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
          Thought types
        </h2>
        <p className="mt-1 text-[0.8125rem] text-ink-muted">
          A type colours a thought. Deleting one leaves its thoughts untyped.
        </p>

        <ul className="mt-3 divide-y divide-rule">
          {types.length === 0 && (
            <li className="py-2 text-[0.8125rem] text-ink-muted">No types yet.</li>
          )}
          {types.map((type) => (
            <li key={type.id} className="flex min-h-tap items-center gap-2 py-1">
              <span
                className="size-3 flex-none rounded-full"
                style={{ background: typeColor(type.color) }}
              />
              <span className="min-w-0 flex-1 truncate text-[0.875rem] text-ink">
                {type.name}
              </span>
              <button
                type="button"
                title={`Delete the ${type.name} type`}
                onClick={() => onDelete(type.id)}
                className="min-h-tap rounded px-2 text-[0.8125rem] text-priority-a hover:bg-surface-raised"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>

        <form
          className="mt-4 border-t border-rule pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            onCreate(name.trim(), color);
            setName("");
          }}
        >
          <input
            value={name}
            placeholder="New type, e.g. Person"
            aria-label="New type name"
            onChange={(event) => setName(event.target.value)}
            className="min-h-tap w-full rounded border border-rule-strong bg-surface px-3 py-1.5 text-base text-ink md:text-[0.875rem]"
          />
          <div
            className="mt-2 flex flex-wrap items-center gap-2"
            role="radiogroup"
            aria-label="Colour"
          >
            {PALETTE.map((index) => (
              <button
                key={index}
                type="button"
                role="radio"
                aria-checked={color === index}
                aria-label={`Colour ${index + 1}`}
                onClick={() => setColor(index)}
                className={`size-7 rounded-full border-2 ${
                  color === index ? "border-ink" : "border-transparent"
                }`}
                style={{ background: typeColor(index) }}
              />
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-tap rounded border border-rule-strong px-3 py-1.5 text-[0.8125rem] text-ink"
            >
              Done
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="min-h-tap rounded bg-ink px-3 py-1.5 text-[0.8125rem] font-medium text-surface disabled:opacity-50"
            >
              Add type
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
  );
}
