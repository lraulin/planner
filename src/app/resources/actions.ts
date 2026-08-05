"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
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

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };
type QueryResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(work: (userId: string) => Promise<T>): Promise<ActionResult> {
  try {
    const userId = await getCurrentUserId();
    const result = await work(userId);
    revalidatePath("/", "layout");
    return typeof result === "string" ? { ok: true, id: result } : { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}

async function runQuery<T>(
  work: (userId: string) => Promise<T>,
): Promise<QueryResult<T>> {
  try {
    return { ok: true, data: await work(await getCurrentUserId()) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}

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
