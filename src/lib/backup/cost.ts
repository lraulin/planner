export const SNAPSHOT_STORAGE_RATE_PER_GB_MONTH = 0.09;
export const PITR_STORAGE_RATE_PER_GB_MONTH = 0.2;
export const BACKUP_INCREMENTAL_ESCALATION_USD = 1;
export const NEON_TOTAL_ESCALATION_USD = 5;

export function weeklySnapshotCostUsd(
  databaseGb: number,
  retainedSnapshots = 13,
): number {
  return databaseGb * retainedSnapshots * SNAPSHOT_STORAGE_RATE_PER_GB_MONTH;
}

export function pitrHistoryCostUsd(historyGb: number): number {
  return historyGb * PITR_STORAGE_RATE_PER_GB_MONTH;
}

export function dailyDumpTransferGb(databaseGb: number, days = 30): number {
  return databaseGb * days;
}

export function maximumRetainedDumpGb(databaseGb: number): number {
  return databaseGb * (14 + 8 + 12);
}

export function shouldReduceNeonRecovery(input: {
  projectedBackupCostUsd: number;
  projectedTotalNeonCostUsd: number;
}): boolean {
  return (
    input.projectedBackupCostUsd > BACKUP_INCREMENTAL_ESCALATION_USD ||
    input.projectedTotalNeonCostUsd > NEON_TOTAL_ESCALATION_USD
  );
}
