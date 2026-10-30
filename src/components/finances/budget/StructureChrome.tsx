"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import type { EnvelopeKind } from "@/db/schema";
import { isComposingKey } from "@/lib/keyboard";
import type { BudgetGroupRow } from "@/lib/finances/budget/queries";
import { StructureComposer } from "./StructureComposer";
import type { BudgetStructure, OpenMenu } from "./useBudgetStructure";

/**
 * The composer strip, if it is open and it belongs to this section.
 *
 * One strip on the page at a time: it is a cursor, and two of them would leave the user
 * guessing which one Enter lands in.
 */
export function SectionComposer({
  structure,
  kind,
}: {
  structure: BudgetStructure;
  kind: EnvelopeKind;
}) {
  const router = useRouter();
  const { composer } = structure;
  if (!composer || composer.kind !== kind) return null;
  return (
    <StructureComposer
      key={`${composer.what}:${composer.kind}:${composer.groupId ?? "root"}`}
      target={composer}
      onCreated={() => router.refresh()}
      onClose={structure.closeComposer}
    />
  );
}

/**
 * The `+` and `⋮` a group header carries, rendered by the host through `groupChrome`.
 *
 * Every click here stops propagation: the whole header row is the collapse toggle, so a
 * `+` that let its click through would collapse the group it was meant to add to.
 */
export function GroupChrome({
  groupId,
  kind,
  groups,
  structure,
  pending,
  openMenu,
}: {
  groupId: string;
  kind: EnvelopeKind;
  groups: readonly BudgetGroupRow[];
  structure: BudgetStructure;
  pending: boolean;
  openMenu: (menu: OpenMenu) => void;
}) {
  const group = groups.find((entry) => entry.id === groupId);
  if (structure.renaming === groupId) {
    return (
      <span
        className="ml-2 flex min-w-0 flex-1 items-center"
        onClick={(event) => event.stopPropagation()}
      >
        <GroupRenameInput
          initial={group?.name ?? ""}
          disabled={pending}
          onCommit={(name) => structure.renameGroup(groupId, name)}
          onCancel={structure.cancelRename}
        />
      </span>
    );
  }
  return (
    <span className="ml-auto flex shrink-0 items-center gap-0.5 pl-2">
      <button
        type="button"
        aria-label={`Add to ${group?.name ?? "group"}`}
        title="Add an envelope in this group"
        className="rounded px-1.5 py-0.5 text-[0.875rem] leading-none font-normal text-ink-muted hover:bg-surface hover:text-ink"
        onClick={(event) => {
          event.stopPropagation();
          structure.openComposer("envelope", kind, groupId);
        }}
      >
        +
      </button>
      <button
        type="button"
        aria-label={`Actions for ${group?.name ?? "group"}`}
        className="rounded px-1.5 py-0.5 text-[0.875rem] leading-none font-normal text-ink-muted hover:bg-surface hover:text-ink"
        onClick={(event) => {
          event.stopPropagation();
          const bounds = event.currentTarget.getBoundingClientRect();
          openMenu({
            x: bounds.left,
            y: bounds.bottom,
            items: structure.groupMenuItems(groupId, kind),
          });
        }}
      >
        ⋮
      </button>
    </span>
  );
}

/**
 * A group header's name, while it is being renamed.
 *
 * Same contract as the row cells (`budgetColumns.tsx`): Enter or blur commits, Escape
 * reverts. It renders beside the header's own label rather than replacing it, because the
 * label belongs to `GroupHeader` and `groupChrome` is a slot after it — the old name staying
 * visible reads as "renaming this", which is what is happening.
 */
function GroupRenameInput({
  initial,
  disabled,
  onCommit,
  onCancel,
}: {
  initial: string;
  disabled: boolean;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const cancelled = useRef(false);
  return (
    <input
      autoFocus
      aria-label={`Name for ${initial}`}
      value={value}
      disabled={disabled}
      className="w-full min-w-0 rounded border border-select-edge bg-surface px-1 py-0.5 font-normal text-ink"
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (cancelled.current) return;
        onCommit(value);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          if (isComposingKey(event.nativeEvent)) return;
          event.preventDefault();
          onCommit(value);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          cancelled.current = true;
          onCancel();
        }
      }}
    />
  );
}

/** The confirm behind every structure Delete…: only empty groups, and envelopes. */
export function DeleteStructureDialog({ structure }: { structure: BudgetStructure }) {
  const { deleting } = structure;
  return (
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
      onCancel={structure.cancelDelete}
      onConfirm={structure.confirmDelete}
    />
  );
}
