import { moduleEntryRedirect } from "@/components/shell/moduleEntry";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The Library entry point. Renders nothing — Contacts and Resources are the pages. */
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await moduleEntryRedirect("library", await searchParams);
}
