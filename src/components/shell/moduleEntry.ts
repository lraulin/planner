import { redirect } from "next/navigation";
import { entryPageFor, pageHref } from "@/lib/navigation/pages";
import { withQuery } from "@/lib/navigation/query";
import { SHELL_SCOPE } from "@/lib/settings/scopes";
import { loadSettingsForSession } from "@/lib/settings/session";
import { parseShellSettings } from "@/lib/settings/shell";
import { moduleById, type ModuleId } from "./modules";

/**
 * What the bare module path does in a module that has pages.
 *
 * `/fitness` is not a page — it is the name of a place with several rooms — so it renders
 * nothing and sends you to one. Every module with a page bar has a `page.tsx` here that does
 * only this, which is what keeps `/fitness/sessions` a real, linkable, reloadable URL instead
 * of a mode `/fitness` happens to be in.
 *
 * **It sends you where you left off**, not always to the default. Calendar|Agenda and
 * Grid|Journal were stored settings before they were routes, and someone who lives in Agenda
 * would have to re-pick it every time the sidebar took them to `/schedule`. Promoting a
 * presentation to a URL should cost nothing.
 *
 * Server-side, before the first byte: the choice must not arrive as a client-side bounce, which
 * is visible as a flash of the wrong page on every visit. The `shell` scope already loads in
 * `src/app/layout.tsx` for exactly this class of decision.
 *
 * The query rides along. `Schedule block…` sends `/schedule?block=<id>` from any grid row, and
 * dropping the parameter on the way through would break the command rather than the URL. A query
 * only some pages read passes those pages as `readers`, so it is not delivered to a remembered
 * page that would ignore it — see `entryPageFor`.
 */
export async function moduleEntryRedirect(
  id: ModuleId,
  params: Record<string, string | string[] | undefined> = {},
  readers?: readonly string[],
): Promise<never> {
  const entry = moduleById(id);
  if (!entry) throw new Error(`Unknown module "${id}"`);

  const page = entryPageFor(id, await rememberedPageId(id), readers);
  if (!page) throw new Error(`Module "${id}" has no default page to enter`);

  redirect(withQuery(pageHref(entry.href, page), params));
}

/**
 * The stored page id for this module, unvalidated — `entryPageFor` drops one this build no
 * longer builds.
 *
 * A settings read cannot be allowed to break the entry point, so a `shell` row that is missing,
 * corrupt, or written by a build with different page ids all end in the same place: the caller
 * falls back to the default.
 */
async function rememberedPageId(id: ModuleId): Promise<string | null> {
  const settings = await loadSettingsForSession();
  return parseShellSettings(settings[SHELL_SCOPE]).lastPage[id] ?? null;
}
