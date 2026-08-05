"use client";

import { useId, useState } from "react";
import { ModalShell } from "@/components/detail/ModalShell";
import { ToolbarButton } from "@/components/tabs/tabChrome";
import type { SavedViewsApi } from "./useSavedViews";

/**
 * The View picker, plus the two commands that make a view something you can create.
 *
 * Built-in views and saved ones sit in one list under separate group headings, because from
 * the user's side they are the same kind of thing — a column layout, some filters and a
 * grouping. The only difference is who named it.
 *
 * Save is enabled always; Delete only while a saved view is selected, so the control that
 * can destroy something is unavailable rather than merely ignored on a built-in.
 */
export function ViewPicker({
  value,
  onChange,
  builtIn,
  saved,
  onSave,
  onDelete,
}: {
  value: string;
  onChange: (id: string) => void;
  builtIn: { id: string; label: string }[];
  saved: SavedViewsApi;
  /** Given a name, captures the grid as it stands and switches to the new view. */
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [naming, setNaming] = useState(false);
  const current = saved.find(value);

  return (
    <>
      <label className="flex flex-none items-center gap-1.5 text-[0.8125rem] text-ink-muted">
        <span className="whitespace-nowrap text-ink-faint">View</span>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-tap rounded border border-rule bg-surface px-2 py-1 text-ink outline-none focus:border-select-edge md:min-h-0"
        >
          <optgroup label="Built in">
            {builtIn.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </optgroup>
          {saved.views.length > 0 && (
            <optgroup label="Saved">
              {saved.views.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>

      <ToolbarButton
        onClick={() => setNaming(true)}
        disabled={saved.atCapacity}
        title={
          saved.atCapacity
            ? "This tab already has the maximum number of saved views"
            : "Save the current columns, filters and grouping as a view"
        }
      >
        Save view…
      </ToolbarButton>

      {current && (
        <ToolbarButton
          onClick={() => onDelete(current.id)}
          title={`Delete “${current.name}”`}
        >
          Delete view
        </ToolbarButton>
      )}

      <NameViewDialog
        open={naming}
        onSubmit={(name) => {
          setNaming(false);
          onSave(name);
        }}
        onCancel={() => setNaming(false)}
      />
    </>
  );
}

/**
 * A one-field prompt. A modal on what is nearly a create flow, and the right call for the
 * same reason quick capture is: it owns no record, it is over in one keystroke, and the grid
 * behind it is what you are naming — hiding it briefly costs nothing.
 */
function NameViewDialog({
  open,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const [name, setName] = useState("");

  return (
    <ModalShell open={open} onClose={onCancel} labelledBy={titleId} width="max-w-sm">
      <form
        className="flex flex-col gap-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(name);
          setName("");
        }}
      >
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
            Save this view
          </h2>
          <p className="text-[0.75rem] text-ink-muted">
            Keeps the columns you are showing, the filters on them, and how they are
            grouped. Sort and density stay with the grid.
          </p>
        </div>

        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="This week"
          aria-label="View name"
          className="rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] text-ink outline-none focus:border-select-edge"
        />

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-tap rounded px-3 py-1.5 text-[0.8125rem] text-ink-muted hover:text-ink md:min-h-0"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="min-h-tap rounded border border-select-edge bg-select px-3 py-1.5 text-[0.8125rem] font-medium text-ink md:min-h-0"
          >
            Save view
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
