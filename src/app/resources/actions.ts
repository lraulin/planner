"use server";

import {
  createResource,
  deleteResource,
  updateResource,
} from "@/lib/resources/mutations";
import { getResourceDetail, listResources } from "@/lib/resources/queries";
import type {
  ResourceDetail,
  ResourceInput,
  ResourceListRow,
} from "@/lib/resources/types";
import { run, runQuery, type ActionResult, type QueryResult } from "../actionResult";

export type { ActionResult };

export async function createResourceAction(
  input?: ResourceInput,
): Promise<ActionResult> {
  return run((userId) => createResource(userId, input));
}

export async function updateResourceAction(
  resourceId: string,
  input: ResourceInput,
): Promise<ActionResult> {
  return run((userId) => updateResource(userId, resourceId, input));
}

export async function deleteResourceAction(resourceId: string): Promise<ActionResult> {
  return run((userId) => deleteResource(userId, resourceId));
}

export async function listResourcesAction(): Promise<QueryResult<ResourceListRow[]>> {
  return runQuery(listResources);
}

export async function getResourceDetailAction(
  resourceId: string,
): Promise<QueryResult<ResourceDetail | null>> {
  return runQuery((userId) => getResourceDetail(userId, resourceId));
}
