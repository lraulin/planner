/**
 * Where a result opens.
 *
 * Pure, so the map from eighteen record kinds to their homes can be tested without a router —
 * and so a page that moves breaks one table rather than a click handler nobody re-reads.
 *
 * **Three tiers, and the difference is visible to the user.** Most kinds open their record
 * through `?detail=`, which the destination view already consumes. Sessions and exercises have
 * real routes of their own. Four kinds — appointments, metrics, life events and commitments —
 * have no deep link today: those views hold the open record in memory, so Find lands on the
 * page (on the right day, where there is one) and the record still has to be picked. `opens`
 * says which, so the command can be labelled honestly rather than promising a drawer that
 * will not appear.
 */

import { notesPath } from "@/lib/url/viewState";
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

    // No deep link yet — these views keep the open record in component state.
    case "appointment":
      return { href: appointmentPath(result), opens: false };
    case "life_event":
      return { href: "/library/timeline", opens: false };
    case "metric":
      return { href: "/metrics", opens: false };
    case "recurring_bill":
    case "recurring_spend":
      return { href: "/finances/commitments", opens: false };
  }
}

/**
 * The calendar on the appointment's own day.
 *
 * `where` is built as `Schedule ▸ YYYY-MM-DD`, so the day is already there. Parsed back out
 * rather than carried as a second field: one source for the day means the column and the link
 * cannot disagree about which one it is.
 */
function appointmentPath(result: FindResult): string {
  const day = /\d{4}-\d{2}-\d{2}/.exec(result.where)?.[0];
  return day ? `/schedule/calendar?date=${day}` : "/schedule/calendar";
}
