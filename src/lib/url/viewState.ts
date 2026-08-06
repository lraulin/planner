/**
 * Encode and decode the view-state query params shared by the grid tabs.
 *
 *   ?detail=<nodeId>   open detail drawer (Outline, Projects, Tasks, Goals, Wishes, Chooser)
 *   ?note=<noteId>     open note drawer (Notes)
 *   ?view=<viewId>     the selected view, built-in or saved (every module with a picker)
 *   ?mode=<modeId>     a module's own display mode (Notes nested/flat)
 *   ?scope=<nodeId>    narrow a list tab to one branch (Tasks, Projects, Goals)
 *
 * `?view=` used to double as the Notes nested/flat mode, which stopped being tenable once
 * Notes gained real views: one param cannot name both which view you are on and how that view
 * draws. So `view` means the view everywhere, and the mode moved to its own param.
 *
 * Filters, sort and column layout stay out of the URL — those live on `user_settings`.
 * Pure helpers so round-trip and junk handling can be unit-tested without a router.
 */

export const DETAIL_PARAM = "detail";
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

export type ViewStatePatch = {
  /** `null` clears the param; `undefined` leaves it alone. */
  detail?: string | null;
  view?: string | null;
  note?: string | null;
  mode?: string | null;
  zoom?: string | null;
  scope?: string | null;
};

export type ViewState = {
  detail: string | null;
  view: string | null;
  note: string | null;
  mode: string | null;
  zoom: string | null;
  scope: string | null;
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
    view: asViewId(firstParam(params, VIEW_PARAM)),
    note: asRecordId(firstParam(params, NOTE_PARAM)),
    // Same shape as a view id — ours, lower-case, no spaces.
    mode: asViewId(firstParam(params, MODE_PARAM)),
    zoom: asRecordId(firstParam(params, ZOOM_PARAM)),
    scope: asRecordId(firstParam(params, SCOPE_PARAM)),
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

  return next;
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
