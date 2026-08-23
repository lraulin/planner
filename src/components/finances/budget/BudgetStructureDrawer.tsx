"use client";

import {
  type Dispatch,
  type DragEvent,
  type SetStateAction,
  useId,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  createBudgetCategoryAction,
  createCategoryGroupAction,
  deleteBudgetCategoryAction,
  deleteCategoryGroupAction,
  moveBudgetStructureItemAction,
  moveBudgetStructureItemIntoGroupAction,
  renameCategoryGroupAction,
  updateBudgetCategoryAction,
} from "@/app/finances/actions";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import { Drawer, DrawerHeader } from "@/components/detail/Drawer";
import {
  budgetChildren,
  descendantGroupIds,
  type BudgetStructureRef,
} from "@/lib/finances/budget/hierarchy";
import type { BudgetCategoryRow, BudgetGroupRow } from "@/lib/finances/budget/queries";

type DeleteTarget =
  | { kind: "group"; id: string; name: string }
  | { kind: "category"; id: string; name: string };

const inputClass =
  "min-h-tap min-w-0 flex-1 rounded border border-rule bg-surface px-2 py-1.5 text-base text-ink outline-none focus:border-select-edge md:min-h-0 md:text-[0.8125rem]";
const buttonClass =
  "min-h-tap rounded border border-rule px-2 py-1 text-[0.8125rem] text-ink hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0";

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
  const [newSubgroup, setNewSubgroup] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState<BudgetStructureRef | null>(null);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const groupById = useMemo(
    () => new Map(groups.map((group) => [group.id, group])),
    [groups],
  );
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

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

  function moveRelative(moving: BudgetStructureRef, direction: -1 | 1) {
    const group = moving.kind === "group" ? groupById.get(moving.id) : undefined;
    const category =
      moving.kind === "category" ? categoryById.get(moving.id) : undefined;
    const parentId = group?.parentGroupId ?? category?.groupId ?? null;
    const siblings = budgetChildren(groups, categories, parentId);
    const index = siblings.findIndex(
      (item) => item.kind === moving.kind && item.id === moving.id,
    );
    const target = siblings[index + direction];
    if (!target) return;
    run(() =>
      moveBudgetStructureItemAction(
        moving,
        { kind: target.kind, id: target.id },
        direction < 0 ? "before" : "after",
      ),
    );
  }

  function handleDrop(event: DragEvent<HTMLElement>, target: BudgetStructureRef) {
    event.preventDefault();
    event.stopPropagation();
    if (!dragging) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientY - bounds.top) / Math.max(bounds.height, 1);
    const zone =
      target.kind === "group" && fraction > 0.28 && fraction < 0.72
        ? "inside"
        : fraction < 0.5
          ? "before"
          : "after";
    setDragging(null);
    run(() => moveBudgetStructureItemAction(dragging, target, zone));
  }

  const roots = budgetChildren(groups, categories, null).filter(
    (item): item is typeof item & { kind: "group" } => item.kind === "group",
  );

  return (
    <>
      <Drawer open onClose={onClose} labelledBy={titleId}>
        <DrawerHeader
          titleId={titleId}
          eyebrow="Budget"
          title="Groups and envelopes"
          onClose={onClose}
        />
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 md:px-5">
          <section>
            <h3 className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
              New top-level group
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

          <p className="text-[0.75rem] leading-5 text-ink-muted">
            Groups only organize and total their envelopes. Drag on desktop, or use the
            move controls on any device.
          </p>

          <div className="space-y-3">
            {roots.map((root) => (
              <StructureGroup
                key={root.id}
                groupId={root.id}
                depth={0}
                groups={groups}
                categories={categories}
                pending={pending}
                dragging={dragging}
                newEnvelope={newEnvelope}
                newSubgroup={newSubgroup}
                run={run}
                onDragStart={setDragging}
                onDragEnd={() => setDragging(null)}
                onDrop={handleDrop}
                onMoveRelative={moveRelative}
                onNewEnvelope={setNewEnvelope}
                onNewSubgroup={setNewSubgroup}
                onDelete={setDeleting}
              />
            ))}
          </div>
          {error ? <p className="text-[0.8125rem] text-priority-a">{error}</p> : null}
        </div>
      </Drawer>
      <ConfirmDialog
        open={deleting !== null}
        title={
          deleting?.kind === "group"
            ? "Delete this empty group?"
            : "Delete this envelope?"
        }
        message={
          deleting?.kind === "group"
            ? `Delete ${deleting.name}? Only empty groups can be deleted.`
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

type Run = (
  work: () => Promise<{ ok: boolean; error?: string }>,
  after?: () => void,
) => void;

function StructureGroup({
  groupId,
  depth,
  groups,
  categories,
  pending,
  dragging,
  newEnvelope,
  newSubgroup,
  run,
  onDragStart,
  onDragEnd,
  onDrop,
  onMoveRelative,
  onNewEnvelope,
  onNewSubgroup,
  onDelete,
}: {
  groupId: string;
  depth: number;
  groups: readonly BudgetGroupRow[];
  categories: readonly BudgetCategoryRow[];
  pending: boolean;
  dragging: BudgetStructureRef | null;
  newEnvelope: Record<string, string>;
  newSubgroup: Record<string, string>;
  run: Run;
  onDragStart: (target: BudgetStructureRef) => void;
  onDragEnd: () => void;
  onDrop: (event: DragEvent<HTMLElement>, target: BudgetStructureRef) => void;
  onMoveRelative: (target: BudgetStructureRef, direction: -1 | 1) => void;
  onNewEnvelope: Dispatch<SetStateAction<Record<string, string>>>;
  onNewSubgroup: Dispatch<SetStateAction<Record<string, string>>>;
  onDelete: (target: DeleteTarget) => void;
}) {
  const group = groups.find((entry) => entry.id === groupId)!;
  const children = budgetChildren(groups, categories, groupId);
  const moving = { kind: "group" as const, id: group.id };
  const empty = children.length === 0;

  return (
    <section
      className={`rounded border border-rule bg-surface p-3 ${depth > 0 ? "ml-3 md:ml-5" : ""} ${dragging ? "outline outline-1 outline-transparent hover:outline-select-edge" : ""}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => onDrop(event, moving)}
    >
      <NameEditor
        initial={group.name}
        pending={pending}
        label="Group name"
        moving={moving}
        groups={groups}
        categories={categories}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onMoveRelative={onMoveRelative}
        onMoveInto={(parentId) =>
          run(() => moveBudgetStructureItemIntoGroupAction(moving, parentId))
        }
        onSave={(name) => run(() => renameCategoryGroupAction(group.id, name))}
        deleteDisabled={!empty}
        deleteTitle={
          empty ? undefined : "Move every subgroup and envelope out before deleting"
        }
        onDelete={() => onDelete({ kind: "group", id: group.id, name: group.name })}
      />

      <div className="mt-3 space-y-2 border-t border-rule pt-3">
        {children.map((child) =>
          child.kind === "group" ? (
            <StructureGroup
              key={child.id}
              groupId={child.id}
              depth={depth + 1}
              groups={groups}
              categories={categories}
              pending={pending}
              dragging={dragging}
              newEnvelope={newEnvelope}
              newSubgroup={newSubgroup}
              run={run}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDrop={onDrop}
              onMoveRelative={onMoveRelative}
              onNewEnvelope={onNewEnvelope}
              onNewSubgroup={onNewSubgroup}
              onDelete={onDelete}
            />
          ) : (
            <EnvelopeEditor
              key={child.id}
              category={categories.find((entry) => entry.id === child.id)!}
              groups={groups}
              categories={categories}
              pending={pending}
              run={run}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDrop={onDrop}
              onMoveRelative={onMoveRelative}
              onDelete={onDelete}
            />
          ),
        )}

        <div className="grid gap-2 pt-1 md:grid-cols-2">
          <div className="flex gap-2">
            <input
              aria-label={`New subgroup in ${group.name}`}
              placeholder="New subgroup"
              value={newSubgroup[group.id] ?? ""}
              onChange={(event) =>
                onNewSubgroup((current) => ({
                  ...current,
                  [group.id]: event.target.value,
                }))
              }
              className={inputClass}
            />
            <button
              type="button"
              className={buttonClass}
              disabled={pending || (newSubgroup[group.id]?.trim() ?? "") === ""}
              onClick={() =>
                run(
                  () =>
                    createCategoryGroupAction(
                      newSubgroup[group.id] ?? "",
                      group.isIncome,
                      group.id,
                    ),
                  () => onNewSubgroup((current) => ({ ...current, [group.id]: "" })),
                )
              }
            >
              Add
            </button>
          </div>
          <div className="flex gap-2">
            <input
              aria-label={`New envelope in ${group.name}`}
              placeholder="New envelope"
              value={newEnvelope[group.id] ?? ""}
              onChange={(event) =>
                onNewEnvelope((current) => ({
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
                    createBudgetCategoryAction(group.id, newEnvelope[group.id] ?? ""),
                  () => onNewEnvelope((current) => ({ ...current, [group.id]: "" })),
                )
              }
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function EnvelopeEditor({
  category,
  groups,
  categories,
  pending,
  run,
  onDragStart,
  onDragEnd,
  onDrop,
  onMoveRelative,
  onDelete,
}: {
  category: BudgetCategoryRow;
  groups: readonly BudgetGroupRow[];
  categories: readonly BudgetCategoryRow[];
  pending: boolean;
  run: Run;
  onDragStart: (target: BudgetStructureRef) => void;
  onDragEnd: () => void;
  onDrop: (event: DragEvent<HTMLElement>, target: BudgetStructureRef) => void;
  onMoveRelative: (target: BudgetStructureRef, direction: -1 | 1) => void;
  onDelete: (target: DeleteTarget) => void;
}) {
  const moving = { kind: "category" as const, id: category.id };
  return (
    <div
      className="rounded bg-surface-raised p-2"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.stopPropagation();
        onDrop(event, moving);
      }}
    >
      <NameEditor
        initial={category.name}
        pending={pending}
        label="Envelope name"
        hidden={category.hidden}
        moving={moving}
        groups={groups}
        categories={categories}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onMoveRelative={onMoveRelative}
        onMoveInto={(groupId) => {
          if (groupId)
            run(() => moveBudgetStructureItemIntoGroupAction(moving, groupId));
        }}
        onSave={(name) => run(() => updateBudgetCategoryAction(category.id, { name }))}
        onToggleHidden={() =>
          run(() =>
            updateBudgetCategoryAction(category.id, { hidden: !category.hidden }),
          )
        }
        onDelete={() =>
          onDelete({ kind: "category", id: category.id, name: category.name })
        }
      />
    </div>
  );
}

function NameEditor({
  initial,
  label,
  pending,
  hidden,
  moving,
  groups,
  categories,
  deleteDisabled,
  deleteTitle,
  onSave,
  onToggleHidden,
  onDelete,
  onDragStart,
  onDragEnd,
  onMoveRelative,
  onMoveInto,
}: {
  initial: string;
  label: string;
  pending: boolean;
  hidden?: boolean;
  moving: BudgetStructureRef;
  groups: readonly BudgetGroupRow[];
  categories: readonly BudgetCategoryRow[];
  deleteDisabled?: boolean;
  deleteTitle?: string;
  onSave: (name: string) => void;
  onToggleHidden?: () => void;
  onDelete: () => void;
  onDragStart: (target: BudgetStructureRef) => void;
  onDragEnd: () => void;
  onMoveRelative: (target: BudgetStructureRef, direction: -1 | 1) => void;
  onMoveInto: (groupId: string | null) => void;
}) {
  const [name, setName] = useState(initial);
  const group =
    moving.kind === "group"
      ? groups.find((entry) => entry.id === moving.id)
      : groups.find(
          (entry) =>
            entry.id ===
            categories.find((category) => category.id === moving.id)?.groupId,
        );
  const parentId =
    moving.kind === "group" ? (group?.parentGroupId ?? null) : (group?.id ?? null);
  const siblings = budgetChildren(groups, categories, parentId);
  const index = siblings.findIndex(
    (entry) => entry.kind === moving.kind && entry.id === moving.id,
  );
  const excluded =
    moving.kind === "group" ? descendantGroupIds(groups, moving.id) : new Set<string>();
  if (moving.kind === "group") excluded.add(moving.id);
  const destinations = groups.filter(
    (entry) => entry.isIncome === group?.isIncome && !excluded.has(entry.id),
  );

  return (
    <div className="grid grid-cols-[auto_1fr] gap-2 md:flex md:flex-wrap md:items-center">
      <button
        type="button"
        draggable
        aria-label={`Drag ${initial}`}
        title="Drag to move"
        className={`${buttonClass} hidden cursor-grab md:block`}
        onDragStart={() => onDragStart(moving)}
        onDragEnd={onDragEnd}
      >
        ↕
      </button>
      <input
        aria-label={label}
        value={name}
        onChange={(event) => setName(event.target.value)}
        className={inputClass}
      />
      <div className="col-span-2 flex flex-wrap gap-2">
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
          disabled={pending || index <= 0}
          title={index <= 0 ? "Already first in this group" : undefined}
          onClick={() => onMoveRelative(moving, -1)}
        >
          Up
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={pending || index < 0 || index >= siblings.length - 1}
          title={
            index >= siblings.length - 1 ? "Already last in this group" : undefined
          }
          onClick={() => onMoveRelative(moving, 1)}
        >
          Down
        </button>
        <label className="sr-only" htmlFor={`move-${moving.kind}-${moving.id}`}>
          Move {initial} to group
        </label>
        <select
          id={`move-${moving.kind}-${moving.id}`}
          className={`${buttonClass} max-w-full bg-surface`}
          value=""
          disabled={pending || destinations.length === 0}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "") return;
            onMoveInto(value === "__root__" ? null : value);
          }}
        >
          <option value="">Move to…</option>
          {moving.kind === "group" && parentId !== null ? (
            <option value="__root__">Top level</option>
          ) : null}
          {destinations
            .filter((entry) => entry.id !== parentId)
            .map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
        </select>
        <button
          type="button"
          className={buttonClass}
          disabled={pending || deleteDisabled}
          title={deleteTitle}
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
