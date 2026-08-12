import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import { safeErrorMessage } from "@/lib/security/safeError";

/**
 * How every server action reports its outcome, and the wrappers that produce it.
 *
 * This lives in `src/app/` rather than `src/lib/` on purpose: it calls `revalidatePath`,
 * which is web-framework knowledge, and `src/lib` is not supposed to know it is in a web
 * app (`development/clean-code.md`). It is a plain module, not a route — only `page`,
 * `route`, `layout` and friends are routable — and it is deliberately **not** `"use server"`,
 * so it can export types and non-async values.
 *
 * Actions return `{ ok: false, error }` instead of throwing, so a rejected save renders
 * inline in the grid or drawer rather than tripping an error boundary
 * (`components/drawer-pattern.md`).
 */

/** A write. `id` is present when the mutation created something. */
export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

/**
 * A write whose payload the caller also needs. Fitness and Metrics read through their
 * action surface as well as writing to it; prefer `runQuery` for anything new.
 */
export type DataActionResult<T> =
  { ok: true; id?: string; data?: T } | { ok: false; error: string };

/** A read. The payload is required, so callers do not have to test for it. */
export type QueryResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * The message an action is allowed to hand back to the browser.
 *
 * Deliberate throws ("Transaction not found.") are the inline validation the drawers and
 * grid render, so they pass through. Anything the database, the network or the filesystem
 * threw is logged and replaced — see `@/lib/security/safeError` for how the two are told
 * apart and why that distinction is drawn where it is.
 */
export function actionErrorMessage(error: unknown): string {
  return safeErrorMessage(error, "action");
}

export type RevalidateTarget = { path: string; type?: "layout" | "page" };

/**
 * Layout-wide by default: a mutation from /projects or /tasks has to refresh the page the
 * user is actually on, not only the one that owns the mutation.
 */
const DEFAULT_REVALIDATE: readonly RevalidateTarget[] = [{ path: "/", type: "layout" }];

function revalidate(targets: readonly RevalidateTarget[]): void {
  for (const target of targets) {
    if (target.type) revalidatePath(target.path, target.type);
    else revalidatePath(target.path);
  }
}

/**
 * Resolve the user, delegate, revalidate, and turn a throw into `{ ok: false }`.
 *
 * A mutation reports a new row either by returning its id as a string or by returning the
 * row itself; both surface as `id` so the caller can select or open what it just created.
 *
 * Pass `revalidate: []` for actions that must not invalidate the page — see
 * `src/app/settings/actions.ts` for the one case and why.
 */
export async function run<T>(
  work: (userId: string) => Promise<T>,
  options: { revalidate?: readonly RevalidateTarget[] } = {},
): Promise<ActionResult> {
  try {
    const userId = await getCurrentUserId();
    const result = await work(userId);
    revalidate(options.revalidate ?? DEFAULT_REVALIDATE);
    if (typeof result === "string") return { ok: true, id: result };
    if (result && typeof result === "object" && "id" in result) {
      const { id } = result as { id: unknown };
      if (typeof id === "string") return { ok: true, id };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error) };
  }
}

type Payload<T> = Exclude<T, string | null | undefined | void>;

/**
 * `run`, for the actions whose clients also need the value the work returned.
 *
 * The payload type drops `string` and the empty cases because those never reach `data`:
 * a string is reported as `id` and a nullish result as a bare `{ ok: true }`, exactly as
 * in `run`. Encoding that here is what lets callers type `data` as the thing they actually
 * return instead of casting it back.
 */
export async function runWithData<T>(
  work: (userId: string) => Promise<T>,
  options: { revalidate?: readonly RevalidateTarget[] } = {},
): Promise<DataActionResult<Payload<T>>> {
  try {
    const userId = await getCurrentUserId();
    const result = await work(userId);
    revalidate(options.revalidate ?? DEFAULT_REVALIDATE);
    if (typeof result === "string") return { ok: true, id: result };
    if (result === undefined || result === null) return { ok: true };
    // The two guards above are exactly the `Exclude` in the return type, but control-flow
    // narrowing cannot produce a conditional type. One assertion here is the price of not
    // making every caller assert instead.
    return { ok: true, data: result as Payload<T> };
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error) };
  }
}

/**
 * The read counterpart. Carries a payload back and does **not** revalidate — opening a
 * drawer should not invalidate the page it is drawn over.
 */
export async function runQuery<T>(
  work: (userId: string) => Promise<T>,
): Promise<QueryResult<T>> {
  try {
    const userId = await getCurrentUserId();
    return { ok: true, data: await work(userId) };
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error) };
  }
}
