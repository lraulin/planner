"use client";

import type { HouseListRow } from "@/lib/houses/types";
import {
  createHouseAction,
  deleteHouseAction,
  listHousesAction,
  refreshHouseRouteAction,
} from "@/app/(shell)/library/houses/actions";
import { CatalogGrid } from "@/components/grid/CatalogGrid";
import { useCatalogGrid } from "@/components/grid/useCatalogGrid";
import type { GridDefaults } from "@/components/grid/useGridState";
import { HouseDrawer, houseName } from "./HouseDrawer";
import { HOUSES_COLUMN_IDS, housesColumns } from "./housesColumns";

const HOUSE_VIEWS = [{ id: "all", label: "All Houses" }] as const;

function viewDefaults(): GridDefaults {
  return { order: [...HOUSES_COLUMN_IDS] };
}

/** House-shopping comparison grid — a small maintained catalog, not a working queue. */
export function HousesView({ initialHouses }: { initialHouses: HouseListRow[] }) {
  const catalog = useCatalogGrid({
    moduleId: "houses",
    builtIn: HOUSE_VIEWS,
    defaultsFor: viewDefaults,
    columns: housesColumns,
    initialRows: initialHouses,
    toNode: (row) => row,
    nameOf: houseName,
    noun: { one: "house", many: "houses" },
    actions: {
      list: listHousesAction,
      create: createHouseAction,
      remove: deleteHouseAction,
    },
    pageCommands: (rowId, count, run) =>
      rowId && count <= 1
        ? [
            {
              id: "houses.recalculateDriveTime",
              label: "Recalculate drive time",
              group: "record",
              menu: "item",
              section: "Item",
              rowMenu: true,
              run: () => run(() => refreshHouseRouteAction(rowId)),
            },
          ]
        : [],
  });

  return (
    <CatalogGrid
      catalog={catalog}
      emptyHint="Add a listing to start comparing it against the rest."
      deleteMessage={(subject) => `${subject} will be removed.`}
      drawer={
        <HouseDrawer
          houseId={catalog.openId}
          onClose={catalog.closeDrawer}
          onChanged={catalog.refresh}
        />
      }
    />
  );
}
