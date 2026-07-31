"use client";

import { useCallback, useEffect, useId, useMemo, useState, useTransition } from "react";
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
  deleteNodeItemAction,
  loadNodeDetailAction,
  moveNodeItemAction,
  saveNodeDetailAction,
  updateNodeItemAction,
} from "@/app/outline/detail-actions";
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
import { ITEM_KINDS } from "./itemKinds";
import { ItemList } from "./ItemList";
import { goalTabs } from "./GoalForm";
import { projectTabs } from "./ProjectForm";
import { resultAreaTabs } from "./ResultAreaForm";
import { taskTabs } from "./TaskForm";
import type { DetailFormProps } from "./formShared";

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
 *   genuinely abandoned and closing a dirty form can ask first.
 * - **Repeating list rows** write straight through, the way the outline grid's inline cells
 *   already do. They are separate records, not fields of this one, and holding a dozen
 *   pending inserts in the client to reconcile on Save would buy nothing.
 *
 * Per `drawer-pattern.md`, the form is guarded on having a record to edit, and keyed on the
 * node id so switching rows resets the draft rather than carrying it across.
 */
export function NodeDetailDrawer({
  node,
  onClose,
}: {
  /** The row the drawer is open on, or null when it is closed. */
  node: OutlineNode | null;
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
  const loadError = current?.error ?? null;

  return (
    <Drawer open={node !== null} onClose={onClose} labelledBy={titleId}>
      {node && (
        <>
          <DrawerHeader
            titleId={titleId}
            eyebrow={KIND_LABELS[kindOfNode(node)]}
            icon={<TypeIcon kind={kindOfNode(node)} className="h-3.5 w-3.5" />}
            title={node.name}
            onClose={onClose}
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
              onReload={(next) =>
                setLoaded({ nodeId: next.id, detail: next, error: null })
              }
              onClose={onClose}
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
  onReload,
  onClose,
}: {
  node: OutlineNode;
  detail: NodeDetail;
  onReload: (detail: NodeDetail) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<NodeDetailValues>(() => initialValues(detail));
  const [items, setItems] = useState<NodeItem[]>(detail.items);
  const { value: drawerSettings, patch: patchDrawer } = useSetting(
    DRAWER_SCOPE,
    DRAWER_CODEC,
  );
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<NodeItem | null>(null);
  const [busy, startTransition] = useTransition();

  const patch = useCallback((changes: Partial<NodeDetailValues>) => {
    setDirty(true);
    setValues((current) => ({ ...current, ...changes }));
  }, []);

  const patchResultArea = useCallback((changes: Partial<ResultAreaDetails>) => {
    setDirty(true);
    setValues((current) => ({
      ...current,
      resultArea: { ...current.resultArea, ...changes },
    }));
  }, []);

  const patchGoal = useCallback((changes: Partial<GoalDetails>) => {
    setDirty(true);
    setValues((current) => ({ ...current, goal: { ...current.goal, ...changes } }));
  }, []);

  const patchProject = useCallback((changes: Partial<ProjectDetails>) => {
    setDirty(true);
    setValues((current) => ({
      ...current,
      project: { ...current.project, ...changes },
    }));
  }, []);

  const patchTask = useCallback((changes: Partial<TaskDetails>) => {
    setDirty(true);
    setValues((current) => ({ ...current, task: { ...current.task, ...changes } }));
  }, []);

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
      />
    ),
    [items, busy, detail.id, runItemAction],
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
      busy,
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
      busy,
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

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveNodeDetailAction(detail.id, values);

      // Order matters: a drawer that closes over a failed save takes the user's input with
      // it. Check the error, keep the drawer open, and let them fix it.
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setDirty(false);
      onClose();
    });
  }

  function requestClose() {
    if (dirty) setConfirmingClose(true);
    else onClose();
  }

  return (
    <>
      <FormTabs tabs={tabs} active={activeTab} onSelect={setActiveTab} />

      <DrawerFooter
        onSave={save}
        onClose={requestClose}
        saving={busy}
        dirty={dirty}
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
function initialValues(detail: NodeDetail): NodeDetailValues {
  return {
    name: detail.name,
    priorityLetter: detail.priorityLetter,
    priorityRank: detail.priorityRank,
    state: detail.state,
    deadline: detail.deadline,
    focus: detail.focus,
    notes: detail.notes,
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
