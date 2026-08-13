"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ModalShell } from "@/components/detail/ModalShell";
import { useRegisterCommands } from "@/components/shell/CommandProvider";
import type { Command } from "@/lib/commands/registry";
import type { ModuleViewsApi } from "./useModuleViews";

/**
 * The View picker, and the commands that write named definitions.
 *
 * The live grid is a working copy. The select stays on the named view you loaded.
 * When the working copy differs, **Unsaved changes** appears — you have not left the
 * view. Save writes the working copy over the active saved view; Save as deep-copies
 * it into a new one. Built-ins are read-only (Save disabled).
 *
 * **Only the select holds bar width.** The commands sit behind `⋯` and in `⌘K`.
 */
export function ViewPicker({ views }: { views: ModuleViewsApi }) {
  const [dialog, setDialog] = useState<"save" | "rename" | null>(null);

  const latest = useRef(views);
  useEffect(() => {
    latest.current = views;
  });

  const current = views.current;
  const currentName = current?.name ?? null;
  const atCapacity = views.saved.atCapacity;
  const dirty = views.dirty;

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
        label: "Save view",
        group: "view",
        menu: "view",
        section: "Saved views",
        icon: "view-save",
        keywords: "update changes overwrite current keep",
        disabled: currentName === null,
        title: unavailable ?? `Write the grid as it stands back into “${currentName}”`,
        run: () => {
          latest.current.save();
          setFlash(true);
        },
      },
      {
        id: "view.saveAs",
        label: "Save view as…",
        group: "view",
        menu: "view",
        section: "Saved views",
        icon: "view-save",
        keywords: "new named preset layout create copy",
        disabled: atCapacity,
        title: atCapacity
          ? "This grid already has the maximum number of saved views"
          : "Save the current columns, filters, grouping and switches as a new view",
        run: () => setDialog("save"),
      },
      {
        id: "view.rename",
        label: "Rename view…",
        group: "view",
        menu: "view",
        section: "Saved views",
        icon: "rename",
        keywords: "name",
        disabled: currentName === null,
        title: unavailable,
        run: () => setDialog("rename"),
      },
      {
        id: "view.delete",
        label: "Delete view",
        group: "view",
        menu: "view",
        section: "Saved views",
        icon: "delete",
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
          onChange={(event) => views.selectView(event.target.value)}
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

      {dirty && !flash && (
        <span className="flex-none whitespace-nowrap text-[0.75rem] text-ink-muted">
          Unsaved changes
        </span>
      )}

      {flash && (
        <span
          role="status"
          className="flex-none whitespace-nowrap text-[0.75rem] text-ink-muted"
        >
          View saved
        </span>
      )}

      <NameViewDialog
        key={dialog ?? "closed"}
        mode={dialog}
        initialName={dialog === "rename" ? (currentName ?? "") : ""}
        onSubmit={(name) => {
          const mode = dialog;
          setDialog(null);
          if (mode === "rename") views.renameCurrent(name);
          else views.saveAs(name);
          setFlash(true);
        }}
        onCancel={() => setDialog(null)}
      />
    </>
  );
}

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
            {renaming ? "Rename this view" : "Save as a new view"}
          </h2>
          <p className="text-[0.75rem] text-ink-muted">
            {renaming
              ? "The view keeps its columns, filters and everything else — only the name changes."
              : "Names the grid as it stands. The view you are on is unchanged."}
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
