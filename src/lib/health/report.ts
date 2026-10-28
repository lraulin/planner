/**
 * What the public health endpoint says, decided without the database so it is unit-tested.
 *
 * Deliberately thin: nothing here names a user, an account, a balance or an event. It says
 * whether the database answered and how long ago each scheduled sync last succeeded, which
 * is what the weekly production check needs from outside and nothing an anonymous caller
 * could use.
 */

const HOUR_MS = 60 * 60 * 1000;

/**
 * A daily job on Vercel Hobby may fire anywhere within its scheduled hour, so two successive
 * runs can be up to ~25 h apart. 36 h allows that plus a margin and still flags a single
 * missed or failed run by the next morning.
 */
export const SYNC_STALE_AFTER_MS = 36 * HOUR_MS;

export type SyncFreshness = {
  lastSyncedAt: string | null;
  stale: boolean;
};

export type HealthReport = {
  status: "ok" | "degraded" | "down";
  database: "ok" | "unreachable";
  commit: string | null;
  bankSync: SyncFreshness | null;
  calendarSync: SyncFreshness | null;
};

/** `null` input means the feature is not set up, which is not a fault. */
export function freshness(
  lastSyncedAt: Date | null | undefined,
  now: Date,
): SyncFreshness {
  return {
    lastSyncedAt: lastSyncedAt ? lastSyncedAt.toISOString() : null,
    stale:
      !lastSyncedAt || now.getTime() - lastSyncedAt.getTime() > SYNC_STALE_AFTER_MS,
  };
}

export function healthReport(input: {
  databaseOk: boolean;
  commit: string | undefined;
  bankSync: SyncFreshness | null;
  calendarSync: SyncFreshness | null;
}): HealthReport {
  const commit = input.commit ? input.commit.slice(0, 7) : null;
  if (!input.databaseOk) {
    return {
      status: "down",
      database: "unreachable",
      commit,
      bankSync: null,
      calendarSync: null,
    };
  }
  const stale = [input.bankSync, input.calendarSync].some((sync) => sync?.stale);
  return {
    status: stale ? "degraded" : "ok",
    database: "ok",
    commit,
    bankSync: input.bankSync,
    calendarSync: input.calendarSync,
  };
}
