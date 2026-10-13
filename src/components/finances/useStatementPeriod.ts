"use client";

import { useEffect, useState } from "react";
import { loadStatementPeriodAction } from "@/app/(shell)/finances/actions";
import type { StatementPeriodRow, StatementViewRow } from "@/lib/finances/types";

/**
 * Server actions run one at a time, so holding an arrow key through the grid would queue a
 * read per row passed and the panel would trail the selection. Waiting this long asks once,
 * for the row the selection stops on.
 */
const SETTLE_MS = 120;

type Loaded = {
  statementId: string;
  rows: StatementPeriodRow[];
  error: string | null;
};

/**
 * The register rows inside the selected statement's period.
 *
 * `rows` is null until the selected statement's own rows have arrived. Keyed on the row
 * object rather than its id: a refresh after an import hands the view new rows, and the
 * period has to be read again with them or it would show the list from before the import.
 */
export function useStatementPeriod(selected: StatementViewRow | null): {
  rows: StatementPeriodRow[] | null;
  error: string | null;
} {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!selected) return;
    const statementId = selected.id;
    let current = true;
    const handle = window.setTimeout(() => {
      void loadStatementPeriodAction(statementId).then((result) => {
        if (!current) return;
        setLoaded(
          result.ok
            ? { statementId, rows: result.data, error: null }
            : { statementId, rows: [], error: result.error },
        );
      });
    }, SETTLE_MS);
    return () => {
      current = false;
      window.clearTimeout(handle);
    };
  }, [selected]);

  if (!selected || loaded?.statementId !== selected.id) {
    return { rows: null, error: null };
  }
  return loaded.error === null
    ? { rows: loaded.rows, error: null }
    : { rows: null, error: loaded.error };
}
