import { legacyRedirect } from "@/components/shell/legacyRedirect";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** `/wishes` is `/plan/wishes` now. See `legacyRedirect`. */
export default async function WishesRedirect({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await legacyRedirect("/plan/wishes", searchParams);
}
