"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { documentTitle } from "./modules";

/**
 * Puts the current page's name in the browser tab.
 *
 * Root `generateMetadata` sets the title for a full load (several Planner tabs in the
 * same window). Layouts persist across in-app navigation, so that metadata would stick
 * on the first page; this follows `usePathname` and writes `document.title` so a click
 * from Tasks to Calendar updates the tab too.
 *
 * A `<title>` tag is the App Router's way of owning the element. The effect covers the
 * case where Next reapplies the root metadata after a client navigation and would
 * otherwise put "Planner" back.
 */
export function DocumentTitle() {
  const pathname = usePathname();
  const title = documentTitle(pathname);

  useEffect(() => {
    document.title = title;
  }, [title]);

  return <title>{title}</title>;
}
