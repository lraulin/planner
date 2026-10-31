"use client";

import { useEffect, useState } from "react";
import type { QueryResult } from "@/app/actionResult";

type Loaded<TDetail> = { id: string; detail: TDetail | null; error: string | null };

/**
 * Load the record a drawer is open on, by id. An answer for an id that is no longer the
 * open one is dropped, and the state is keyed by id, so switching records reads as
 * "not loaded yet" rather than showing one record under another's header.
 *
 * `current` is null while loading or closed; `replace` puts a saved record in place
 * without a reload. `noun` builds the two failure messages: "That contact no longer
 * exists." / "Could not load this contact." A rejected action gets the second rather than
 * leaving the drawer on its loading state forever.
 */
export function useRecordById<TDetail extends { id: string }>(
  id: string | null,
  load: (id: string) => Promise<QueryResult<TDetail | null>>,
  noun: string,
) {
  const [loaded, setLoaded] = useState<Loaded<TDetail> | null>(null);

  useEffect(() => {
    if (!id) return;
    let current = true;
    void load(id).then(
      (result) => {
        if (!current) return;
        if (!result.ok) setLoaded({ id, detail: null, error: result.error });
        else if (!result.data) {
          setLoaded({ id, detail: null, error: `That ${noun} no longer exists.` });
        } else setLoaded({ id, detail: result.data, error: null });
      },
      () => {
        if (current)
          setLoaded({ id, detail: null, error: `Could not load this ${noun}.` });
      },
    );
    return () => {
      current = false;
    };
  }, [id, load, noun]);

  return {
    current: id !== null && loaded?.id === id ? loaded : null,
    replace: (recordId: string, detail: TDetail | null) =>
      setLoaded({ id: recordId, detail, error: null }),
  };
}
