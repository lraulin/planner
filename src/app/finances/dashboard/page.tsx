import { redirect } from "next/navigation";

export default function FinancesDashboardPage(): never {
  redirect("/finances/accounts");
}
