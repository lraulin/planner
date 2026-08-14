"use server";

import { deriveChronology, loadLifeHistory } from "@/lib/timeline/chronology";
import {
  createLifeEvent,
  deleteLifeEvent,
  updateLifeEvent,
} from "@/lib/timeline/mutations";
import { deriveRibbon, type Ribbon } from "@/lib/timeline/ribbon";
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

/** Both drawings of the page, so an edit refreshes whichever one you are looking at. */
export type TimelinePayload = { rows: ChronologyRow[]; ribbon: Ribbon };

export async function listTimelineAction(): Promise<QueryResult<TimelinePayload>> {
  return runQuery(async (userId) => {
    const { events, jobs, residences } = await loadLifeHistory(userId);
    return {
      rows: deriveChronology(events, jobs, residences),
      ribbon: deriveRibbon(events, jobs, residences),
    };
  });
}
