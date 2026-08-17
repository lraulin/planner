"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type MutableRefObject,
} from "react";
import type {
  GoalDetails,
  NodeItem,
  NodeItemKind,
  ProjectDetails,
  ResultAreaDetails,
  TaskDetails,
} from "@/db/schema";
import { KIND_LABELS, kindOfNode } from "@/lib/tree/hierarchy";
import { TypeIcon } from "@/components/icons/TypeIcon";
import type { OutlineNode } from "@/lib/tree/types";
import type { NodeDetail, NodeDetailValues, NodeItemValues } from "@/lib/detail/types";
import {
  createNodeItemAction,
  importNodeItemsAction,
  deleteNodeItemAction,
  loadNodeDetailAction,
  moveNodeItemAction,
  saveNodeDetailAction,
  updateNodeItemAction,
} from "@/app/plan/outline/detail-actions";
import { useSetting, type SettingCodec } from "@/components/settings/SettingsProvider";
import {
  parseDrawerSettings,
  serializeDrawerSettings,
  type DrawerSettings,
} from "@/lib/settings/drawer";
import { DRAWER_SCOPE } from "@/lib/settings/scopes";
import { ConfirmDialog } from "./ConfirmDialog";
import { Drawer, DrawerFooter, DrawerHeader } from "./Drawer";
import { FormTabs } from "./FormTabs";
import { ITEM_KINDS } from "@/lib/detail/itemKinds";
import { ItemList } from "./ItemList";
import { goalTabs } from "./GoalForm";
import { projectTabs } from "./ProjectForm";
import { resultAreaTabs } from "./ResultAreaForm";
import { taskTabs } from "./TaskForm";
import type { DetailFormProps } from "./formShared";
import { categoryOptions } from "@/lib/tree/slice";
import { formState } from "@/lib/detail/formState";
import { useToday } from "@/components/grid/useToday";

const DRAWER_CODEC: SettingCodec<DrawerSettings> = {
  parse: parseDrawerSettings,
  serialize: serializeDrawerSettings,
};

/**
 * The detail drawer: fetches one record, hands it to the form for its type, and saves.
 *
 * Two things save on different schedules, deliberately:
 *
 * - **Scalar fields** are held as a draft and written on Save, so an abandoned edit is
 *   genuinely abandoned and closing a dirty form can ask first. Save stays open; Save &
 *   Close leaves after a successful write; Cancel alone discards when dirty
 *   (`drawer-pattern.md`).
 * - **Repeating list rows** write straight through, the way the outline grid's inline cells
 *   already do. They are separate records, not fields of this one, and holding a dozen
 *   pending inserts in the client to reconcile on Save would buy nothing.
 *
 * The form is guarded on having a record to edit, and keyed on the node id so switching
 * rows resets the draft rather than carrying it across.
 */
export function NodeDetailDrawer({
  node,
  nodes = [],
  onClose,
}: {
  /** The row the drawer is open on, or null when it is closed. */
  node: OutlineNode | null;
  /**
   * Full outline (or a rich enough subset) so the Result Area form can offer existing
   * categories in its combobox. Optional — defaults still cover Personal / Work.
   */
  nodes?: OutlineNode[];
  onClose: () => void;
}) {
  const titleId = useId();
  const nodeId = node?.id ?? null;

  // The fetch result carries the id it was fetched for, so a result for the previously
  // opened row reads as "not loaded yet" rather than being cleared by an effect.
  const [loaded, setLoaded] = useState<{
    nodeId: string;
    detail: NodeDetail | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!nodeId) return;

    let current = true;
    void loadNodeDetailAction(nodeId).then(
      (result) => {
        // A second open may have overtaken this one; only the latest may write.
        if (!current) return;
        if (!result.ok) setLoaded({ nodeId, detail: null, error: result.error });
        else if (!result.data)
          setLoaded({ nodeId, detail: null, error: "That record no longer exists." });
        else setLoaded({ nodeId, detail: result.data, error: null });
      },
      // A rejected action (dropped connection, server crash) would otherwise leave the
      // drawer stuck on its loading state with nothing to explain why.
      () => {
        if (current) {
          setLoaded({ nodeId, detail: null, error: "Could not load this record." });
        }
      },
    );

    return () => {
      current = false;
    };
  }, [nodeId]);

  const current = loaded?.nodeId === nodeId ? loaded : null;
  const detail = current?.detail ?? null;
  const categories = useMemo(() => categoryOptions(nodes), [nodes]);
  const loadError = current?.error ?? null;

  // DetailForm installs a dirty-aware handler while mounted so Escape / backdrop / header
  // all share the footer Cancel path (`drawer-pattern.md`).
  const formCloseRef = useRef<(() => void) | null>(null);
  const requestClose = useCallback(() => {
    if (formCloseRef.current) formCloseRef.current();
    else onClose();
  }, [onClose]);

  return (
    <Drawer open={node !== null} onClose={requestClose} labelledBy={titleId}>
      {node && (
        <>
          <DrawerHeader
            titleId={titleId}
            eyebrow={KIND_LABELS[kindOfNode(node)]}
            icon={<TypeIcon kind={kindOfNode(node)} className="h-3.5 w-3.5" />}
            title={node.name}
            onClose={requestClose}
          />

          {loadError ? (
            <p role="alert" className="px-5 py-4 text-[0.875rem] text-priority-a">
              {loadError}
            </p>
          ) : !detail ? (
            <p className="px-5 py-4 text-[0.875rem] text-ink-muted">Loading…</p>
          ) : (
            <DetailForm
              key={detail.id}
              node={node}
              detail={detail}
              categories={categories}
              onReload={(next) =>
                setLoaded({ nodeId: next.id, detail: next, error: null })
              }
              onClose={onClose}
              formCloseRef={formCloseRef}
            />
          )}
        </>
      )}
    </Drawer>
  );
}

function DetailForm({
  node,
  detail,
  categories,
  onReload,
  onClose,
  formCloseRef,
}: {
  node: OutlineNode;
  detail: NodeDetail;
  categories: string[];
  onReload: (detail: NodeDetail) => void;
  onClose: () => void;
  /** Parent chrome calls this while the form is mounted. */
  formCloseRef: MutableRefObject<(() => void) | null>;
}) {
  // Effective state so a due-again routine opens as Not started (matching the grid), not
  // as the stored Postponed residue of its last cycle — see `formState`.
  const today = useToday();
  const [values, setValues] = useState<NodeDetailValues>(() =>
    initialValues(detail, today),
  );
  const [items, setItems] = useState<NodeItem[]>(detail.items);
  const { value: drawerSettings, patch: patchDrawer } = useSetting(
    DRAWER_SCOPE,
    DRAWER_CODEC,
  );
  const [dirty, setDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<NodeItem | null>(null);
  const [busy, startTransition] = useTransition();

  // `useToday` is null on the server and the first client paint so nothing flashes the wrong
  // shelf; once it resolves, re-derive State from the effective value — but only while the
  // form is still clean, so a half-edited draft is not rewritten under the user's thumb.
  const [seenToday, setSeenToday] = useState(today);
  if (today !== seenToday) {
    setSeenToday(today);
    if (!dirty) {
      setValues((current) => ({
        ...current,
        state: formState(detail, today),
      }));
    }
  }

  const markDirty = useCallback(() => {
    setDirty(true);
    setJustSaved(false);
  }, []);

  const patch = useCallback(
    (changes: Partial<NodeDetailValues>) => {
      markDirty();
      setValues((current) => ({ ...current, ...changes }));
    },
    [markDirty],
  );

  const patchResultArea = useCallback(
    (changes: Partial<ResultAreaDetails>) => {
      markDirty();
      setValues((current) => ({
        ...current,
        resultArea: { ...current.resultArea, ...changes },
      }));
    },
    [markDirty],
  );

  const patchGoal = useCallback(
    (changes: Partial<GoalDetails>) => {
      markDirty();
      setValues((current) => ({ ...current, goal: { ...current.goal, ...changes } }));
    },
    [markDirty],
  );

  const patchProject = useCallback(
    (changes: Partial<ProjectDetails>) => {
      markDirty();
      setValues((current) => ({
        ...current,
        project: { ...current.project, ...changes },
      }));
    },
    [markDirty],
  );

  const patchTask = useCallback(
    (changes: Partial<TaskDetails>) => {
      markDirty();
      setValues((current) => ({ ...current, task: { ...current.task, ...changes } }));
    },
    [markDirty],
  );

  /** Re-reads the record after a list write, so ids and ordering come from the server. */
  const refreshItems = useCallback(async () => {
    try {
      const result = await loadNodeDetailAction(detail.id);
      if (result.ok && result.data) {
        setItems(result.data.items);
        onReload(result.data);
      }
    } catch {
      // The write landed; only the re-read failed. Rows on screen may now carry
      // optimistic ids and stale ordering, so say so rather than looking healthy.
      setError("Saved, but the list could not be refreshed. Reopen to see it.");
    }
  }, [detail.id, onReload]);

  /**
   * Re-seeds the whole draft from the server, not just the lists. Used after a save, where
   * the server may have changed more than it was asked to.
   */
  const reseed = useCallback(async () => {
    try {
      const result = await loadNodeDetailAction(detail.id);
      if (result.ok && result.data) {
        setValues(initialValues(result.data, today));
        setItems(result.data.items);
        onReload(result.data);
      }
    } catch {
      setError("Saved, but the record could not be re-read. Reopen to see it.");
    }
  }, [detail.id, onReload, today]);

  const runItemAction = useCallback(
    (action: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
      setError(null);
      startTransition(async () => {
        const result = await action();
        if (!result.ok) setError(result.error);
        else await refreshItems();
      });
    },
    [refreshItems],
  );

  /**
   * For commands that write on their own rather than through the draft. Unlike
   * `runItemAction` this re-seeds the whole form, because such a command can change fields
   * the user is looking at — Skip Recurrence moves every date on the General tab.
   */
  const runAction = useCallback(
    (action: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
      setError(null);
      startTransition(async () => {
        const result = await action();
        if (!result.ok) setError(result.error);
        else await reseed();
      });
    },
    [reseed],
  );

  const list = useCallback(
    (kind: NodeItemKind) => (
      <ItemList
        key={kind}
        kind={kind}
        items={items.filter((item) => item.kind === kind)}
        busy={busy}
        onCreate={() =>
          runItemAction(() => createNodeItemAction({ nodeId: detail.id, kind }))
        }
        onChange={(itemId, changes: NodeItemValues) => {
          // Reflect the edit immediately; the refresh that follows confirms it.
          setItems((current) =>
            current.map((item) =>
              item.id === itemId ? { ...item, ...changes } : item,
            ),
          );
          runItemAction(() => updateNodeItemAction(itemId, changes));
        }}
        onDelete={setPendingDelete}
        onMove={(itemId, direction) =>
          runItemAction(() => moveNodeItemAction(itemId, direction))
        }
        onImport={(rows) =>
          new Promise((resolve) => {
            startTransition(async () => {
              const result = await importNodeItemsAction({
                nodeId: detail.id,
                kind,
                rows,
              });
              if (!result.ok) {
                resolve(result);
                return;
              }
              await refreshItems();
              resolve({ ok: true, created: result.data.created });
            });
          })
        }
      />
    ),
    [items, busy, detail.id, runItemAction, refreshItems, startTransition],
  );

  const formProps: DetailFormProps = useMemo(
    () => ({
      detail,
      node,
      values,
      patch,
      patchResultArea,
      patchGoal,
      patchProject,
      patchTask,
      list,
      runAction,
      busy,
      categories,
      resultAreas: detail.resultAreas,
    }),
    [
      detail,
      node,
      values,
      patch,
      patchResultArea,
      patchGoal,
      patchProject,
      patchTask,
      list,
      runAction,
      busy,
      categories,
    ],
  );

  const tabs = useMemo(() => {
    switch (detail.type) {
      case "result_area":
        return resultAreaTabs(formProps);
      case "goal":
        return goalTabs(formProps);
      case "project":
        return projectTabs(formProps);
      default:
        return taskTabs(formProps);
    }
  }, [detail.type, formProps]);

  // Prefer the last tab this type was left on, but only if that form still has it —
  // a renamed tab should fall back to General rather than leave the drawer blank.
  const tabIds = useMemo(() => tabs.map((tab) => tab.id), [tabs]);
  const storedTab = drawerSettings.tabByType[detail.type];
  const activeTab =
    storedTab && tabIds.includes(storedTab) ? storedTab : (tabIds[0] ?? "general");

  const setActiveTab = useCallback(
    (tabId: string) => {
      patchDrawer((current) => ({
        ...current,
        tabByType: { ...current.tabByType, [detail.type]: tabId },
      }));
    },
    [patchDrawer, detail.type],
  );

  function save(options?: { close?: boolean }) {
    setError(null);
    startTransition(async () => {
      const result = await saveNodeDetailAction(detail.id, values);

      // Order matters: never close over a failed save — keep the input and let them fix it.
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setDirty(false);
      setJustSaved(true);
      // Save stays open by default; Save & Close leaves only after a successful write
      // (`drawer-pattern.md`).
      if (options?.close) {
        onClose();
        return;
      }

      // Re-read, because a save is not always a no-op on the server. Completing a repeating
      // task cycles it — the row comes back Not Started with its dates pushed out — and this
      // draft was seeded once, behind a `key` that does not change. Without the re-read the
      // State select goes on reading "Completed" while the grid behind the drawer reads
      // "Not Started", and pressing Save again cycles the task a second time.
      await reseed();
    });
  }

  const requestClose = useCallback(() => {
    if (dirty) setConfirmingClose(true);
    else onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    formCloseRef.current = requestClose;
    return () => {
      formCloseRef.current = null;
    };
  }, [formCloseRef, requestClose]);

  return (
    <>
      <FormTabs tabs={tabs} active={activeTab} onSelect={setActiveTab} />

      <DrawerFooter
        onSave={() => save()}
        onSaveAndClose={() => save({ close: true })}
        onClose={requestClose}
        saving={busy}
        dirty={dirty}
        justSaved={justSaved}
        error={error}
      />

      <ConfirmDialog
        open={confirmingClose}
        title="Discard your changes?"
        message="This form has edits that have not been saved. Closing now loses them."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
        onConfirm={() => {
          setConfirmingClose(false);
          onClose();
        }}
        onCancel={() => setConfirmingClose(false)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete this ${pendingDelete ? ITEM_KINDS[pendingDelete.kind].singular : "row"}?`}
        message={
          pendingDelete?.title
            ? `"${pendingDelete.title}" will be removed. This cannot be undone.`
            : "This row will be removed. This cannot be undone."
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (target) runItemAction(() => deleteNodeItemAction(target.id));
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}

/**
 * Seeds the draft from the loaded record. The side tables start as the stored row minus its
 * key, so a form reads `values.project.company` whether or not the user has touched it.
 */
function initialValues(detail: NodeDetail, today: string | null): NodeDetailValues {
  return {
    name: detail.name,
    priorityLetter: detail.priorityLetter,
    priorityRank: detail.priorityRank,
    state: formState(detail, today),
    deadline: detail.deadline,
    targetStartDate: detail.targetStartDate,
    targetEndDate: detail.targetEndDate,
    deferredDate: detail.deferredDate,
    focus: detail.focus,
    notes: detail.notes,
    resultAreaId: detail.resultAreaId,
    resultArea: withoutKey(detail.resultArea),
    goal: withoutKey(detail.goal),
    project: withoutKey(detail.project),
    task: withoutKey(detail.task),
  };
}

/** A side-table row as editable values — everything but the foreign key it is keyed on. */
function withoutKey<T extends { nodeId: string }>(
  row: T | null,
): Partial<Omit<T, "nodeId">> {
  if (!row) return {};
  const { nodeId, ...values } = row;
  void nodeId;
  return values;
}
