import { redirect } from "next/navigation";
import { builtPageById, defaultPageFor, pageHref } from "@/lib/navigation/pages";
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
 * dropping the parameter on the way through would break the command rather than the URL.
 */
export async function moduleEntryRedirect(
  id: ModuleId,
  params: Record<string, string | string[] | undefined> = {},
): Promise<never> {
  const entry = moduleById(id);
  if (!entry) throw new Error(`Unknown module "${id}"`);

  const page = (await rememberedPage(id)) ?? defaultPageFor(id);
  if (!page) throw new Error(`Module "${id}" has no default page to enter`);

  redirect(withQuery(pageHref(entry.href, page), params));
}

/**
 * The stored page for this module, dropped if this build no longer builds it.
 *
 * A settings read cannot be allowed to break the entry point, so a `shell` row that is missing,
 * corrupt, or written by a build with different page ids all end in the same place: `null`, and
 * the caller falls back to the default.
 */
async function rememberedPage(id: ModuleId) {
  const settings = await loadSettingsForSession();
  const stored = parseShellSettings(settings[SHELL_SCOPE]).lastPage[id];
  return builtPageById(id, stored ?? null);
}

/**
 * Next hands repeated params as arrays. Both shapes are re-encoded rather than stringified, so
 * a date key or a node id with a reserved character survives the hop.
 */
function withQuery(
  href: string,
  params: Record<string, string | string[] | undefined>,
): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) {
      query.append(key, entry);
    }
  }

  const search = query.toString();
  return search ? `${href}?${search}` : href;
}
