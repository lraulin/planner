"use client";

import { Fragment, useEffect, useId, useState, type ReactNode } from "react";
import type { QueryResult } from "@/app/actionResult";
import { Drawer, DrawerHeader } from "@/components/detail/Drawer";

/**
 * The drawer of a record catalog — Jobs, Residences, Houses, Resources: load the record named
 * by `?detail=`, title the drawer with its name, and hand it to the catalog's form.
 *
 * The fetch result carries the id it was fetched for, so a slow result for the previously
 * opened record reads as "not loaded yet" instead of showing one record under another's
 * title. A rejected action is an error too; without it the drawer would sit on "Loading…".
 *
 * The form is keyed by record, so opening another record starts a fresh draft.
 */
export function RecordDrawer<TDetail extends { id: string }>({
  recordId,
  load,
  noun,
  titleOf,
  onClose,
  children,
}: {
  /** Straight from `?detail=`. Null means closed. */
  recordId: string | null;
  load: (id: string) => Promise<QueryResult<TDetail | null>>;
  /** `"job"` — the eyebrow and the load errors are built from it. */
  noun: string;
  titleOf: (detail: TDetail) => string;
  onClose: () => void;
  children: (detail: TDetail) => ReactNode;
}) {
  const titleId = useId();
  const [loaded, setLoaded] = useState<{
    recordId: string;
    detail: TDetail | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!recordId) return;
    let current = true;
    void load(recordId).then(
      (result) => {
        if (!current) return;
        if (!result.ok) setLoaded({ recordId, detail: null, error: result.error });
        else if (!result.data) {
          setLoaded({
            recordId,
            detail: null,
            error: `That ${noun} no longer exists.`,
          });
        } else {
          setLoaded({ recordId, detail: result.data, error: null });
        }
      },
      () => {
        if (current) {
          setLoaded({ recordId, detail: null, error: `Could not load this ${noun}.` });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [recordId, load, noun]);

  if (!recordId) return null;
  const current = loaded?.recordId === recordId ? loaded : null;
  const title = current?.detail
    ? titleOf(current.detail)
    : current?.error
      ? "Could not open"
      : "Loading…";

  return (
    <Drawer open onClose={onClose} labelledBy={titleId}>
      <DrawerHeader
        titleId={titleId}
        eyebrow={noun.charAt(0).toUpperCase() + noun.slice(1)}
        title={title}
        onClose={onClose}
      />
      {current?.error ? (
        <p role="alert" className="px-5 py-4 text-[0.875rem] text-priority-a">
          {current.error}
        </p>
      ) : current?.detail ? (
        <Fragment key={current.detail.id}>{children(current.detail)}</Fragment>
      ) : null}
    </Drawer>
  );
}
