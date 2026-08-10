"use server";

import { run } from "@/app/actionResult";
import { organizeInboxItem } from "@/lib/organizer/mutations";
import type { OrganizerOutcome } from "@/lib/organizer/types";

export async function organizeInboxItemAction(
  itemId: string,
  outcome: OrganizerOutcome,
) {
  return run((userId) => organizeInboxItem(userId, itemId, outcome));
}
