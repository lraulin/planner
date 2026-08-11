import { cache } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { loadUserSettings } from "./queries";
import type { SettingsSnapshot } from "./queries";

/**
 * The current user's preferences for the root layout, or an empty snapshot.
 *
 * Request-scoped via React `cache` so layout and any page that re-reads settings share one
 * round trip. Failures are swallowed on purpose, and there are two of them. The expected
 * one is having no session at all: `/login` renders through the same root layout, and
 * `getCurrentUserId` throws rather than returning null. The other is the database being
 * unreachable — in which case falling back to default columns and filters is far better
 * than failing the whole page over a display preference.
 */
export const loadSettingsForSession = cache(async (): Promise<SettingsSnapshot> => {
  try {
    const userId = await getCurrentUserId();
    return await loadUserSettings(userId);
  } catch {
    return {};
  }
});
