"use client";

import { useId, useState, useTransition } from "react";
import {
  createBudgetCategoryAction,
  createCategoryGroupAction,
  deleteBudgetCategoryAction,
  deleteCategoryGroupAction,
  renameCategoryGroupAction,
  updateBudgetCategoryAction,
} from "@/app/finances/actions";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import { Drawer, DrawerHeader } from "@/components/detail/Drawer";
import type { BudgetCategoryRow, BudgetGroupRow } from "@/lib/finances/budget/queries";

type DeleteTarget =
  | { kind: "group"; id: string; name: string }
  | { kind: "category"; id: string; name: string };

const inputClass =
  "min-h-tap min-w-0 flex-1 rounded border border-rule bg-surface px-2 py-1.5 text-base text-ink outline-none focus:border-select-edge md:min-h-0 md:text-[0.8125rem]";
const buttonClass =
  "min-h-tap rounded border border-rule px-2 py-1 text-[0.8125rem] text-ink hover:bg-surface-raised disabled:opacity-50 md:min-h-0";

export function BudgetStructureDrawer({
  groups,
  categories,
  onClose,
  onChanged,
}: {
  groups: readonly BudgetGroupRow[];
  categories: readonly BudgetCategoryRow[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const titleId = useId();
  const [newGroup, setNewGroup] = useState("");
  const [income, setIncome] = useState(false);
  const [newEnvelope, setNewEnvelope] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(
    work: () => Promise<{ ok: boolean; error?: string }>,
    after?: () => void,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) setError(result.error ?? "Could not save.");
      else {
        after?.();
        onChanged();
      }
    });
  }

  return (
    <>
      <Drawer open onClose={onClose} labelledBy={titleId}>
        <DrawerHeader
          titleId={titleId}
          eyebrow="Budget"
          title="Groups and envelopes"
          onClose={onClose}
        />
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
          <section>
            <h3 className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
              New group
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                aria-label="Group name"
                value={newGroup}
                onChange={(event) => setNewGroup(event.target.value)}
                className={inputClass}
              />
              <label className="flex min-h-tap items-center gap-2 text-[0.8125rem] text-ink md:min-h-0">
                <input
                  type="checkbox"
                  checked={income}
                  onChange={(event) => setIncome(event.target.checked)}
                />
                Income
              </label>
              <button
                type="button"
                disabled={pending || newGroup.trim() === ""}
                className={buttonClass}
                onClick={() =>
                  run(
                    () => createCategoryGroupAction(newGroup, income),
                    () => {
                      setNewGroup("");
                      setIncome(false);
                    },
                  )
                }
              >
                Add group
              </button>
            </div>
          </section>

          {groups.map((group) => (
            <section
              key={group.id}
              className="rounded border border-rule bg-surface p-3"
            >
              <NameEditor
                initial={group.name}
                pending={pending}
                label="Group name"
                onSave={(name) => run(() => renameCategoryGroupAction(group.id, name))}
                onDelete={() =>
                  setDeleting({ kind: "group", id: group.id, name: group.name })
                }
              />
              <div className="mt-3 space-y-2 border-t border-rule pt-3">
                {categories
                  .filter((category) => category.groupId === group.id)
                  .map((category) => (
                    <NameEditor
                      key={category.id}
                      initial={category.name}
                      pending={pending}
                      label="Envelope name"
                      hidden={category.hidden}
                      onSave={(name) =>
                        run(() => updateBudgetCategoryAction(category.id, { name }))
                      }
                      onToggleHidden={() =>
                        run(() =>
                          updateBudgetCategoryAction(category.id, {
                            hidden: !category.hidden,
                          }),
                        )
                      }
                      onDelete={() =>
                        setDeleting({
                          kind: "category",
                          id: category.id,
                          name: category.name,
                        })
                      }
                    />
                  ))}
                <div className="flex gap-2">
                  <input
                    aria-label={`New envelope in ${group.name}`}
                    placeholder="New envelope"
                    value={newEnvelope[group.id] ?? ""}
                    onChange={(event) =>
                      setNewEnvelope((current) => ({
                        ...current,
                        [group.id]: event.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={pending || (newEnvelope[group.id]?.trim() ?? "") === ""}
                    onClick={() =>
                      run(
                        () =>
                          createBudgetCategoryAction(
                            group.id,
                            newEnvelope[group.id] ?? "",
                          ),
                        () =>
                          setNewEnvelope((current) => ({ ...current, [group.id]: "" })),
                      )
                    }
                  >
                    Add envelope
                  </button>
                </div>
              </div>
            </section>
          ))}
          {error ? <p className="text-[0.8125rem] text-priority-a">{error}</p> : null}
        </div>
      </Drawer>
      <ConfirmDialog
        open={deleting !== null}
        title={
          deleting?.kind === "group" ? "Delete this group?" : "Delete this envelope?"
        }
        message={
          deleting?.kind === "group"
            ? `Delete ${deleting.name} and every envelope inside it? Transactions remain and return to the backlog.`
            : `Delete ${deleting?.name ?? "this envelope"}? Its transactions remain and return to the backlog.`
        }
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (!target) return;
          run(() =>
            target.kind === "group"
              ? deleteCategoryGroupAction(target.id)
              : deleteBudgetCategoryAction(target.id),
          );
        }}
      />
    </>
  );
}

function NameEditor({
  initial,
  label,
  pending,
  hidden,
  onSave,
  onToggleHidden,
  onDelete,
}: {
  initial: string;
  label: string;
  pending: boolean;
  hidden?: boolean;
  onSave: (name: string) => void;
  onToggleHidden?: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(initial);
  return (
    <div className="grid grid-cols-3 gap-2 md:flex md:flex-wrap md:items-center">
      <input
        aria-label={label}
        value={name}
        onChange={(event) => setName(event.target.value)}
        className={`${inputClass} col-span-3 md:col-span-1`}
      />
      <button
        type="button"
        className={buttonClass}
        disabled={pending || name.trim() === initial || name.trim() === ""}
        onClick={() => onSave(name)}
      >
        Save
      </button>
      {onToggleHidden ? (
        <button
          type="button"
          className={buttonClass}
          disabled={pending}
          onClick={onToggleHidden}
        >
          {hidden ? "Show" : "Hide"}
        </button>
      ) : null}
      <button
        type="button"
        className={buttonClass}
        disabled={pending}
        onClick={onDelete}
      >
        Delete
      </button>
    </div>
  );
}
