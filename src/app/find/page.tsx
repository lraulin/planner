import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { FindView } from "@/components/find/FindView";
import { asSearchQuery } from "@/lib/url/viewState";

export const dynamic = "force-dynamic";

/**
 * Advanced Find.
 *
 * Nothing is loaded here. The search itself runs from the client through `findAction`,
 * because it depends on the reader's local day — shelf expiry and "is this appointment in
 * the past" are questions about the browser's wall clock, which the server cannot answer
 * (`development/dates.md`). The page's job is to read `?q=` so a reload or a pasted link
 * reproduces the search.
 */
export default async function FindPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.q;
  const query = asSearchQuery(Array.isArray(raw) ? raw[0] : raw) ?? "";

  return (
    <AppShell active="find">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <FindView initialQuery={query} />
      </Suspense>
    </AppShell>
  );
}
