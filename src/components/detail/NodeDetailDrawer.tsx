"use client";

import { useCallback, useEffect, useId, useMemo, useState, useTransition } from "react";
import type {
  NodeItem,
  NodeItemKind,
  ProjectDetails,
  ResultAreaDetails,
  TaskDetails,
} from "@/db/schema";
import { TYPE_LABELS } from "@/lib/tree/hierarchy";
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
import { ConfirmDialog } from "./ConfirmDialog";
import { Drawer, DrawerFooter, DrawerHeader } from "./Drawer";
import { FormTabs } from "./FormTabs";
import { ITEM_KINDS } from "./itemKinds";
import { ItemList } from "./ItemList";
import { projectTabs } from "./ProjectForm";
import { resultAreaTabs } from "./ResultAreaForm";
import { simpleNodeTabs } from "./SimpleNodeForm";
import type { DetailFormProps } from "./formShared";

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
    loadNodeDetailAction(nodeId).then((result) => {
      // A second open may have overtaken this one; only the latest may write.
      if (!current) return;
      if (!result.ok) setLoaded({ nodeId, detail: null, error: result.error });
      else if (!result.data)
        setLoaded({ nodeId, detail: null, error: "That record no longer exists." });
      else setLoaded({ nodeId, detail: result.data, error: null });
    });

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
            eyebrow={TYPE_LABELS[node.type]}
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
  const [activeTab, setActiveTab] = useState("general");
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
  const refreshItems = useCallback(() => {
    loadNodeDetailAction(detail.id).then((result) => {
      if (result.ok && result.data) {
        setItems(result.data.items);
        onReload(result.data);
      }
    });
  }, [detail.id, onReload]);

  const runItemAction = useCallback(
    (action: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
      setError(null);
      startTransition(async () => {
        const result = await action();
        if (!result.ok) setError(result.error);
        else refreshItems();
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
      patchProject,
      patchTask,
      list,
      busy,
    }),
    [detail, node, values, patch, patchResultArea, patchProject, patchTask, list, busy],
  );

  const tabs = useMemo(() => {
    switch (detail.type) {
      case "result_area":
        return resultAreaTabs(formProps);
      case "project":
        return projectTabs(formProps);
      default:
        return simpleNodeTabs(formProps);
    }
  }, [detail.type, formProps]);

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
