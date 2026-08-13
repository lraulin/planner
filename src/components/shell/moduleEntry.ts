import { redirect } from "next/navigation";
import { defaultPageFor, pageHref } from "@/lib/navigation/pages";
import { moduleById, type ModuleId } from "./modules";

/**
 * What the bare module path does in a module that has pages.
 *
 * `/fitness` is not a page — it is the name of a place with several rooms — so it renders
 * nothing and sends you to one. Every module with a page bar has a `page.tsx` here that does
 * only this, which is what keeps `/fitness/sessions` a real, linkable, reloadable URL instead
 * of a mode `/fitness` happens to be in.
 *
 * Server-side, before the first byte: the choice must not arrive as a client-side bounce, which
 * is visible as a flash of the wrong page on every visit.
 *
 * The query rides along. `Schedule block…` sends `/schedule?block=<id>` from any grid row, and
 * dropping the parameter on the way through would break the command rather than the URL.
 */
export function moduleEntryRedirect(
  id: ModuleId,
  params: Record<string, string | string[] | undefined> = {},
): never {
  const entry = moduleById(id);
  const page = defaultPageFor(id);

  if (!entry || !page) {
    throw new Error(`Module "${id}" has no default page to enter`);
  }

  redirect(withQuery(pageHref(entry.href, page), params));
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
