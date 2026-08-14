"use server";

import { loadChronology } from "@/lib/timeline/chronology";
import {
  createLifeEvent,
  deleteLifeEvent,
  updateLifeEvent,
} from "@/lib/timeline/mutations";
import type { ChronologyRow, LifeEventInput } from "@/lib/timeline/types";
import { run, runQuery, type ActionResult, type QueryResult } from "../../actionResult";

/**
 * `eventDate` is required and comes from the client, which is the only party that knows what
 * day it is where the user is — see `development/dates.md`.
 */
export async function createLifeEventAction(
  input: LifeEventInput & { eventDate: string },
): Promise<ActionResult> {
  return run((userId) => createLifeEvent(userId, input));
}

export async function updateLifeEventAction(
  eventId: string,
  input: LifeEventInput,
): Promise<ActionResult> {
  return run((userId) => updateLifeEvent(userId, eventId, input));
}

export async function deleteLifeEventAction(eventId: string): Promise<ActionResult> {
  return run((userId) => deleteLifeEvent(userId, eventId));
}

export async function listChronologyAction(): Promise<QueryResult<ChronologyRow[]>> {
  return runQuery(loadChronology);
}
