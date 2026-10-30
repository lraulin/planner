"use client";

import type { ResidenceListRow } from "@/lib/residences/types";
import {
  createResidenceAction,
  deleteResidenceAction,
  listResidencesAction,
} from "@/app/(shell)/library/residences/actions";
import { CatalogGrid } from "@/components/grid/CatalogGrid";
import { useCatalogGrid } from "@/components/grid/useCatalogGrid";
import type { GridDefaults } from "@/components/grid/useGridState";
import { useToday } from "@/components/grid/useToday";
import { spanDuration } from "@/lib/history/span";
import { ResidenceDrawer } from "./ResidenceDrawer";
import { RESIDENCES_COLUMN_IDS, residencesColumns } from "./residencesColumns";

const RESIDENCE_VIEWS = [{ id: "all", label: "All Residences" }] as const;

function viewDefaults(): GridDefaults {
  return {
    order: [...RESIDENCES_COLUMN_IDS],
    sorts: [{ columnId: "movedIn", direction: "desc" }],
  };
}

function nameOf(row: ResidenceListRow): string {
  return row.city || row.label || row.streetAddress || "Untitled residence";
}

/** Where you have lived — a catalog you maintain, whose dates feed the Timeline chronology. */
export function ResidencesView({
  initialResidences,
}: {
  initialResidences: ResidenceListRow[];
}) {
  const todayKey = useToday();
  const catalog = useCatalogGrid({
    moduleId: "residences",
    builtIn: RESIDENCE_VIEWS,
    defaultsFor: viewDefaults,
    columns: residencesColumns,
    initialRows: initialResidences,
    // Duration is derived here, not in the query — see the same note in `JobsView`.
    toNode: (row) => ({
      ...row,
      duration: spanDuration({ start: row.movedIn, end: row.movedOut }, todayKey),
    }),
    nameOf,
    noun: { one: "residence", many: "residences" },
    actions: {
      list: listResidencesAction,
      create: createResidenceAction,
      remove: deleteResidenceAction,
    },
  });

  return (
    <CatalogGrid
      catalog={catalog}
      emptyHint="Every place you add with dates shows up on the Timeline."
      deleteMessage={(subject, count) =>
        `${subject} will be removed, along with ${count === 1 ? "its" : "their"} dates on the Timeline.`
      }
      drawer={
        <ResidenceDrawer
          residenceId={catalog.openId}
          onClose={catalog.closeDrawer}
          onChanged={catalog.refresh}
        />
      }
    />
  );
}
