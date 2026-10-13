import { moduleEntryRedirect } from "@/components/shell/moduleEntry";

export const dynamic = "force-dynamic";

/** Open the remembered finance page, falling back to Budget. */
export default async function FinancesPage(): Promise<never> {
  return moduleEntryRedirect("finances");
}
