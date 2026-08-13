import { legacyRedirect } from "@/components/shell/legacyRedirect";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** `/outline` is `/plan/outline` now. See `legacyRedirect`. */
export default async function OutlineRedirect({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await legacyRedirect("/plan/outline", searchParams);
}
