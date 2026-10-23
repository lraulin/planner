import { cache } from "react";
import { findCurrentAccount } from "@/lib/auth";
import { loadUserSettings } from "./queries";
import type { SettingsSnapshot } from "./queries";

/**
 * The current user's preferences for the root layout, or an empty snapshot.
 *
 * Request-scoped via React `cache` so layout and any page that re-reads settings share one
 * round trip. No session is an empty snapshot, not a redirect: `/login` renders through the
 * same root layout, so the redirecting `getCurrentUserId` here would send `/login` to itself.
 * A failed read, the session's included, is swallowed on purpose — falling back to default columns and filters is far
 * better than failing the whole page over a display preference.
 */
export const loadSettingsForSession = cache(async (): Promise<SettingsSnapshot> => {
  try {
    const account = await findCurrentAccount();
    return account ? await loadUserSettings(account.id) : {};
  } catch {
    return {};
  }
});
