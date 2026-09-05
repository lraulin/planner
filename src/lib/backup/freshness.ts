const HOUR_MS = 60 * 60 * 1_000;

export const BACKUP_FRESH_HOURS = 20;
export const BACKUP_STALE_HOURS = 30;

export type BackupFreshness = "fresh" | "due" | "stale";

export function backupFreshness(latest: Date | null, now: Date): BackupFreshness {
  if (!latest) return "stale";
  const ageHours = (now.getTime() - latest.getTime()) / HOUR_MS;
  if (ageHours < BACKUP_FRESH_HOURS) return "fresh";
  if (ageHours < BACKUP_STALE_HOURS) return "due";
  return "stale";
}

export function backupAgeHours(latest: Date, now: Date): number {
  return Math.max(0, (now.getTime() - latest.getTime()) / HOUR_MS);
}
