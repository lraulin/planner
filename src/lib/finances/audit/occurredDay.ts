/**
 * Wall-clock calendar day of a Finance Activity event.
 *
 * `occurredAt` is an instant. The Time column used to feed the date filter
 * `toISOString().slice(0, 10)`, which is the UTC date — a 9pm Eastern event
 * filtered and grouped as tomorrow. Contacts, Resources, and Time Charts already
 * use `localDateKey` for `updatedAt`; this is the same rule for Activity.
 */

import { localDateKey } from "@/lib/schedule/geometry";

export function activityOccurredDayKey(occurredAt: Date): string {
  return localDateKey(occurredAt);
}
