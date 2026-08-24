/**
 * Where a result opens.
 *
 * Pure, so the map from eighteen record kinds to their homes can be tested without a router —
 * and so a page that moves breaks one table rather than a click handler nobody re-reads.
 *
 * Most kinds open through `?detail=`, which the destination view already consumes. Sessions
 * and exercises have real routes of their own. `opens` is still on the type so a future kind
 * that can only land on its page can be labelled honestly — today every kind actually opens.
 */

import { hrefWithViewState, notesPath } from "@/lib/url/viewState";
import type { FindResult } from "./types";

export type FindTarget = {
  href: string;
  /** True when following `href` actually opens the record, not just the page it lives on. */
  opens: boolean;
};

/**
 * The outline reveals a `?select=` landing — expanding collapsed ancestors and clearing a
 * zoom that excludes the row — while `?detail=` opens the drawer. A result wants both: the
 * row visible *and* the record open. `2026-08-14-1142-view-in-outline`.
 */
function outlinePath(nodeId: string): string {
  return `/plan/outline?select=${encodeURIComponent(nodeId)}&detail=${encodeURIComponent(nodeId)}`;
}

function detailPath(pathname: string, id: string): string {
  return `${pathname}?detail=${encodeURIComponent(id)}`;
}

export function resultTarget(result: FindResult): FindTarget {
  const { kind, recordId, ownerId } = result;

  switch (kind) {
    case "result_area":
    case "goal":
    case "project":
    case "task":
      return { href: outlinePath(recordId), opens: true };

    // A sub-record has no page of its own; it lives inside the owning record's drawer.
    case "node_item":
      return { href: outlinePath(ownerId ?? recordId), opens: true };

    case "note":
      return { href: notesPath(recordId), opens: true };

    case "contact":
      return { href: detailPath("/library/contacts", recordId), opens: true };
    case "contact_item":
      return {
        href: detailPath("/library/contacts", ownerId ?? recordId),
        opens: true,
      };

    case "resource":
      return { href: detailPath("/library/resources", recordId), opens: true };
    case "job":
      return { href: detailPath("/library/jobs", recordId), opens: true };
    case "residence":
      return { href: detailPath("/library/residences", recordId), opens: true };

    case "exercise":
      return {
        href: `/fitness/exercises/${encodeURIComponent(recordId)}`,
        opens: true,
      };
    case "workout_session":
      // A session exercise carries its session as the owner; both land on the session page.
      return {
        href: `/fitness/sessions/${encodeURIComponent(ownerId ?? recordId)}`,
        opens: true,
      };

    case "transaction":
      return { href: detailPath("/finances/register", recordId), opens: true };
    case "finance_account":
      return { href: detailPath("/finances/accounts", recordId), opens: true };
    case "finance_payee":
      return { href: detailPath("/finances/payees", recordId), opens: true };

    case "appointment":
      return { href: appointmentPath(result), opens: true };
    case "life_event":
      return { href: detailPath("/library/timeline", recordId), opens: true };
    case "metric":
      return { href: detailPath("/metrics", recordId), opens: true };
    case "budget_envelope":
      return { href: detailPath("/finances/budget", recordId), opens: true };
  }
}

/**
 * The calendar on the appointment's own day, drawer open.
 *
 * `where` is built as `Schedule ▸ YYYY-MM-DD`, so the day is already there. Parsed back out
 * rather than carried as a second field: one source for the day means the column and the link
 * cannot disagree about which one it is.
 *
 * The day is `?start=`, not `?date=`. `?date=` is Notes / Day; the calendar anchors its
 * range on `?start=` (`ScheduleRangePage`).
 */
function appointmentPath(result: FindResult): string {
  const day = /\d{4}-\d{2}-\d{2}/.exec(result.where)?.[0];
  const current = new URLSearchParams();
  if (day) current.set("start", day);
  return hrefWithViewState("/schedule/calendar", current, {
    detail: result.recordId,
  });
}
