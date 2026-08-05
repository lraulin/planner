"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ModalShell } from "@/components/detail/ModalShell";
import { useRegisterCommands } from "@/components/shell/CommandProvider";
import type { Command } from "@/lib/commands/registry";
import type { ModuleViewsApi } from "./useModuleViews";

/**
 * The View picker, and the four commands that make a view something you own.
 *
 * Built-in views and saved ones sit in one list under separate group headings, because from the
 * user's side they are the same kind of thing — a column layout, some filters, a grouping and
 * some switch positions. The only difference is who named it.
 *
 * **Only the select holds bar width.** Save / Update / Rename / Delete register as commands and
 * appear behind `⋯` and in `⌘K`, which is what `data-grid.md`'s three-tier table asks of "a real
 * command, used occasionally" — the tier `Show Fields` and `Reset this grid` already sit in.
 * Four more buttons on every grid would have been a fourth tier invented to avoid reading the
 * table.
 *
 * The three that act on the selected view are **disabled, not absent**, on a built-in: a
 * command that vanishes teaches you it does not exist, and a built-in view is simply not yours
 * to rename.
 */
export function ViewPicker({ views }: { views: ModuleViewsApi }) {
  const [dialog, setDialog] = useState<"save" | "rename" | null>(null);

  /**
   * The commands read the module through a ref rather than closing over it.
   *
   * `views` carries the live grid, so it is a fresh object every render. In the deps of the memo
   * below it would rebuild `commands` every render, and `useRegisterCommands` re-registers —
   * and sets state — whenever that array changes. Only the facts that change how a command
   * *reads* belong in the deps; what it *does* is read at click time.
   */
  const latest = useRef(views);
  useEffect(() => {
    latest.current = views;
  });

  const current = views.current;
  const currentName = current?.name ?? null;
  const atCapacity = views.saved.atCapacity;

  /**
   * Update writes what is already on screen, so nothing visibly happens — the one command here
   * with no natural feedback. `ux-principles.md` asks for some.
   */
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(false), 1600);
    return () => clearTimeout(timer);
  }, [flash]);

  const commands = useMemo<Command[]>(() => {
    const unavailable = currentName === null ? "This is a built-in view" : undefined;

    return [
      {
        id: "view.save",
        label: "Save view…",
        group: "view",
        keywords: "new named preset layout create",
        disabled: atCapacity,
        title: atCapacity
          ? "This grid already has the maximum number of saved views"
          : "Save the current columns, filters, grouping and switches as a view",
        run: () => setDialog("save"),
      },
      {
        id: "view.update",
        label: "Update view",
        group: "view",
        keywords: "save changes overwrite current",
        disabled: currentName === null,
        title: unavailable ?? `Write the grid as it stands back into “${currentName}”`,
        run: () => {
          latest.current.updateCurrent();
          setFlash(true);
        },
      },
      {
        id: "view.rename",
        label: "Rename view…",
        group: "view",
        keywords: "name",
        disabled: currentName === null,
        title: unavailable,
        run: () => setDialog("rename"),
      },
      {
        id: "view.delete",
        label: "Delete view",
        group: "view",
        keywords: "remove",
        disabled: currentName === null,
        destructive: true,
        title: unavailable ?? `Delete “${currentName}”`,
        run: () => latest.current.deleteCurrent(),
      },
    ];
  }, [currentName, atCapacity]);

  useRegisterCommands(commands);

  return (
    <>
      <label className="flex flex-none items-center gap-1.5 text-[0.8125rem] text-ink-muted">
        <span className="whitespace-nowrap text-ink-faint">View</span>
        <select
          value={views.viewId}
          onChange={(event) => views.setViewId(event.target.value)}
          className="min-h-tap rounded border border-rule bg-surface px-2 py-1 text-ink outline-none focus:border-select-edge md:min-h-0"
        >
          <optgroup label="Built in">
            {views.builtIn.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </optgroup>
          {views.saved.views.length > 0 && (
            <optgroup label="Saved">
              {views.saved.views.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>

      {flash && (
        <span
          role="status"
          className="flex-none whitespace-nowrap text-[0.75rem] text-ink-muted"
        >
          View updated
        </span>
      )}

      <NameViewDialog
        // Keyed so the input starts from the right name each time it opens, rather than
        // remembering what was typed into a dialog that has since been cancelled.
        key={dialog ?? "closed"}
        mode={dialog}
        initialName={dialog === "rename" ? (currentName ?? "") : ""}
        onSubmit={(name) => {
          setDialog(null);
          if (dialog === "rename") views.renameCurrent(name);
          else views.saveAs(name);
        }}
        onCancel={() => setDialog(null)}
      />
    </>
  );
}

/**
 * A one-field prompt, for both Save and Rename. A modal on what is nearly a create flow, and
 * the right call for the same reason quick capture is: it owns no record, it is over in one
 * keystroke, and the grid behind it is what you are naming — hiding it briefly costs nothing.
 */
function NameViewDialog({
  mode,
  initialName,
  onSubmit,
  onCancel,
}: {
  mode: "save" | "rename" | null;
  initialName: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const [name, setName] = useState(initialName);
  const renaming = mode === "rename";

  return (
    <ModalShell
      open={mode !== null}
      onClose={onCancel}
      labelledBy={titleId}
      width="max-w-sm"
    >
      <form
        className="flex flex-col gap-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(name);
        }}
      >
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
            {renaming ? "Rename this view" : "Save this view"}
          </h2>
          <p className="text-[0.75rem] text-ink-muted">
            {renaming
              ? "The view keeps its columns, filters and everything else — only the name changes."
              : "Keeps the columns you are showing, the filters on them, how they are grouped, and where the toolbar switches are set. Sort and density stay with the grid."}
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
            {renaming ? "Rename" : "Save view"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
