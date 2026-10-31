"use client";

import type { ContactOption } from "@/lib/contacts/types";
import type { ResourceListRow } from "@/lib/resources/types";
import {
  createResourceAction,
  deleteResourceAction,
  listResourcesAction,
} from "@/app/(shell)/library/resources/actions";
import { CatalogGrid } from "@/components/grid/CatalogGrid";
import { useCatalogGrid } from "@/components/grid/useCatalogGrid";
import type { GridDefaults } from "@/components/grid/useGridState";
import { ResourceDrawer, resourceName } from "./ResourceDrawer";
import { RESOURCES_COLUMN_IDS, resourcesColumns } from "./resourcesColumns";

const RESOURCE_VIEWS = [{ id: "all", label: "All Resources" }] as const;

function viewDefaults(): GridDefaults {
  return { order: [...RESOURCES_COLUMN_IDS] };
}

/** Resources list — a small maintained catalog rather than a second schedule surface. */
export function ResourcesView({
  initialResources,
  contacts,
}: {
  initialResources: ResourceListRow[];
  contacts: ContactOption[];
}) {
  const catalog = useCatalogGrid({
    moduleId: "resources",
    builtIn: RESOURCE_VIEWS,
    defaultsFor: viewDefaults,
    columns: resourcesColumns,
    initialRows: initialResources,
    toNode: (row) => row,
    nameOf: resourceName,
    noun: { one: "resource", many: "resources" },
    actions: {
      list: listResourcesAction,
      create: createResourceAction,
      remove: deleteResourceAction,
    },
  });

  return (
    <CatalogGrid
      catalog={catalog}
      emptyHint="Add the people or pools of capacity you plan your week around."
      deleteMessage={(subject) =>
        `${subject} will be removed. Existing weekly plans keep the capacity already saved to them.`
      }
      drawer={
        <ResourceDrawer
          resourceId={catalog.openId}
          contacts={contacts}
          onClose={catalog.closeDrawer}
          onChanged={catalog.refresh}
        />
      }
    />
  );
}
