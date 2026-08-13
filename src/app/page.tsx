import { redirect } from "next/navigation";

/**
 * Straight to Plan, which resolves to the page you were last on and to Overview when there is
 * no history. This pointed at `/overview` directly until Overview became one of Plan's pages —
 * a hub is the right landing for a first visit and the wrong one for the four-hundredth.
 */
export default function Home() {
  redirect("/plan");
}
