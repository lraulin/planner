/**
 * Encode and decode the view-state query params shared by the grid tabs.
 *
 *   ?detail=<id>       open this record (drawer where there is one; selected row on
 *                      Timeline and Commitments, which edit in the grid)
 *   ?select=<nodeId>   select this outline row without opening the drawer (View in Outline)
 *   ?note=<noteId>     open note drawer (Notes)
 *   ?view=<viewId>     the selected view, built-in or saved (every module with a picker)
 *   ?mode=<modeId>     a module's own display mode (Notes nested/flat)
 *   ?scope=<nodeId>    narrow a list tab to one branch (Tasks, Projects, Goals)
 *   ?date=YYYY-MM-DD   selected calendar day (Notes journal, Day)
 *   ?q=<text>          the Advanced Find query
 *
 * `?view=` used to double as the Notes nested/flat mode, which stopped being tenable once
 * Notes gained real views: one param cannot name both which view you are on and how that view
 * draws. So `view` means the view everywhere, and the mode moved to its own param.
 *
 * Filters, sort and column layout stay out of the URL — those live on `user_settings`.
 * Pure helpers so round-trip and junk handling can be unit-tested without a router.
 */

export const DETAIL_PARAM = "detail";
/**
 * Land on this outline row without opening its drawer. `?detail=` is "the form is open";
 * this is "this is the selected row." View in Outline is the reason it exists — see
 * `outlineSelectPath`.
 */
export const SELECT_PARAM = "select";
export const VIEW_PARAM = "view";
export const NOTE_PARAM = "note";
export const MODE_PARAM = "mode";
export const ZOOM_PARAM = "zoom";
/**
 * The branch a list tab is narrowed to — the Project select on Tasks, the Goal select on
 * Projects, the Result Area select on Goals.
 *
 * These already existed as local `useState`, which meant the narrowing survived neither reload
 * nor Back. Putting it in the URL fixes that *and* is what makes `View tasks…` a plain
 * navigation rather than one grid reaching into another one's internals.
 */
export const SCOPE_PARAM = "scope";
export const DATE_PARAM = "date";
/**
 * What Advanced Find is looking for.
 *
 * In the URL where filters are not, and the exception proves the rule: `?q=` is not a lens on
 * a list that exists anyway — without it `/find` has nothing to show. Reload, Back and a
 * pasted link all have to reproduce the search, and the first render is server-side because
 * of it. The sources, field classes and match options *are* filters, and stay in
 * `user_settings` under the `find` scope.
 */
export const Q_PARAM = "q";

export type ViewStatePatch = {
  /** `null` clears the param; `undefined` leaves it alone. */
  detail?: string | null;
  select?: string | null;
  view?: string | null;
  note?: string | null;
  mode?: string | null;
  zoom?: string | null;
  scope?: string | null;
  date?: string | null;
  q?: string | null;
};

export type ViewState = {
  detail: string | null;
  select: string | null;
  view: string | null;
  note: string | null;
  mode: string | null;
  zoom: string | null;
  scope: string | null;
  date: string | null;
  q: string | null;
};

/**
 * Opaque record ids (node, note). Reject empty, whitespace-only, and strings that would
 * break query parsing — not a UUID check, because ids are opaque and may change format.
 */
export function asRecordId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 128) return null;
  if (/[\s#&?=]/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Sub-view ids are ours (`active-status`, `nested`). Same shape as settings scope keys —
 * lower-case, no spaces — so a hand-edited URL cannot smuggle anything surprising.
 */
/**
 * A calendar-day key. Rejects the wrong shape and dates that do not exist (Feb 31),
 * because a bad `?date=` must not become an invalid Date that later math walks forever.
 */
export function asDateKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const encoded = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    encoded.getUTCFullYear() !== year ||
    encoded.getUTCMonth() + 1 !== month ||
    encoded.getUTCDate() !== day
  ) {
    return null;
  }
  return value;
}

/**
 * A free-text search query.
 *
 * Almost anything is legal — it is prose, and a regex query is deliberately full of
 * punctuation — so this only trims and caps the length. The cap is not a security control;
 * it stops a pasted document becoming a URL no browser will keep.
 */
export function asSearchQuery(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 200);
}

export function asViewId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^[a-z0-9][a-z0-9.-]{0,63}$/.test(trimmed)) return null;
  return trimmed;
}

/** Read one named param, treating multi-value and junk as absent. */
function firstParam(params: URLSearchParams, key: string): string | null {
  const values = params.getAll(key);
  if (values.length !== 1) return null;
  return values[0] ?? null;
}

export function readViewState(params: URLSearchParams): ViewState {
  return {
    detail: asRecordId(firstParam(params, DETAIL_PARAM)),
    select: asRecordId(firstParam(params, SELECT_PARAM)),
    view: asViewId(firstParam(params, VIEW_PARAM)),
    note: asRecordId(firstParam(params, NOTE_PARAM)),
    // Same shape as a view id — ours, lower-case, no spaces.
    mode: asViewId(firstParam(params, MODE_PARAM)),
    zoom: asRecordId(firstParam(params, ZOOM_PARAM)),
    scope: asRecordId(firstParam(params, SCOPE_PARAM)),
    date: asDateKey(firstParam(params, DATE_PARAM)),
    q: asSearchQuery(firstParam(params, Q_PARAM)),
  };
}

export function readDetailParam(params: URLSearchParams): string | null {
  return readViewState(params).detail;
}

export function readViewParam(params: URLSearchParams): string | null {
  return readViewState(params).view;
}

export function readNoteParam(params: URLSearchParams): string | null {
  return readViewState(params).note;
}

export function readZoomParam(params: URLSearchParams): string | null {
  return readViewState(params).zoom;
}

/**
 * Apply a patch onto a copy of `current`. Clearing a key deletes it; other query params
 * the page already has (e.g. future filters) are preserved.
 */
export function writeViewState(
  current: URLSearchParams,
  patch: ViewStatePatch,
): URLSearchParams {
  const next = new URLSearchParams(current.toString());

  if (patch.detail !== undefined) {
    const id = asRecordId(patch.detail);
    if (id) next.set(DETAIL_PARAM, id);
    else next.delete(DETAIL_PARAM);
  }

  if (patch.select !== undefined) {
    const id = asRecordId(patch.select);
    if (id) next.set(SELECT_PARAM, id);
    else next.delete(SELECT_PARAM);
  }

  if (patch.view !== undefined) {
    const id = asViewId(patch.view);
    if (id) next.set(VIEW_PARAM, id);
    else next.delete(VIEW_PARAM);
  }

  if (patch.note !== undefined) {
    const id = asRecordId(patch.note);
    if (id) next.set(NOTE_PARAM, id);
    else next.delete(NOTE_PARAM);
  }

  if (patch.mode !== undefined) {
    const id = asViewId(patch.mode);
    if (id) next.set(MODE_PARAM, id);
    else next.delete(MODE_PARAM);
  }

  if (patch.zoom !== undefined) {
    const id = asRecordId(patch.zoom);
    if (id) next.set(ZOOM_PARAM, id);
    else next.delete(ZOOM_PARAM);
  }

  if (patch.scope !== undefined) {
    const id = asRecordId(patch.scope);
    if (id) next.set(SCOPE_PARAM, id);
    else next.delete(SCOPE_PARAM);
  }

  if (patch.date !== undefined) {
    const key = asDateKey(patch.date);
    if (key) next.set(DATE_PARAM, key);
    else next.delete(DATE_PARAM);
  }

  if (patch.q !== undefined) {
    const query = asSearchQuery(patch.q);
    if (query) next.set(Q_PARAM, query);
    else next.delete(Q_PARAM);
  }

  return next;
}

/**
 * True when the patch writes only `?detail=` — the open record.
 *
 * That param is the address bar's copy of "this drawer is open". It is not an input to
 * any page's data load: the Register already has every row, Contacts already has the
 * contact. Honouring this with a History API write (rather than a client-router
 * navigation) is what keeps opening or closing a drawer from re-running the page —
 * on the Register that refetch left the drawer stuck open until thousands of rows
 * came back.
 *
 * Every other key is page data. Find's `?q=` *is* the search the page runs; a
 * History API write would leave the results on the previous query.
 */
export function writesOnlyOpenRecord(patch: ViewStatePatch): boolean {
  let sawDetail = false;
  for (const key of Object.keys(patch) as (keyof ViewStatePatch)[]) {
    if (patch[key] === undefined) continue;
    if (key !== "detail") return false;
    sawDetail = true;
  }
  return sawDetail;
}

/**
 * Build a same-path href with the patched query. Empty query becomes bare pathname so the
 * address bar stays clean after a close.
 */
export function hrefWithViewState(
  pathname: string,
  current: URLSearchParams,
  patch: ViewStatePatch,
): string {
  const next = writeViewState(current, patch);
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** Convenience for deep-links into Notes (e.g. a node's Linked Notes panel). */
export function notesPath(noteId?: string | null): string {
  return hrefWithViewState("/notes", new URLSearchParams(), {
    note: noteId ?? null,
  });
}

/** Notes journal presentation on a calendar day. */
export function notesJournalPath(dateKey: string, noteId?: string | null): string {
  return hrefWithViewState("/notes", new URLSearchParams(), {
    date: dateKey,
    note: noteId ?? null,
  });
}

/**
 * Land on this row in the Outline without opening its drawer.
 *
 * A fresh params object, not a patch on the current page: View in Outline is a
 * destination, not a lens change, so Projects' `?view=` / `?scope=` must not come along.
 */
/** Advanced Find, optionally with a query already run. */
export function findPath(query?: string | null): string {
  const cleaned = asSearchQuery(query);
  return cleaned ? `/find?${Q_PARAM}=${encodeURIComponent(cleaned)}` : "/find";
}

export function outlineSelectPath(nodeId: string): string {
  return hrefWithViewState("/plan/outline", new URLSearchParams(), {
    select: nodeId,
  });
}
