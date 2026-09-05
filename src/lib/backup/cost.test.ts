import { describe, expect, it } from "vitest";

import {
  dailyDumpTransferGb,
  maximumRetainedDumpGb,
  pitrHistoryCostUsd,
  shouldReduceNeonRecovery,
  weeklySnapshotCostUsd,
} from "./cost";

describe("backup cost estimates", () => {
  it("calculates the pessimistic full-copy snapshot and portable dump bounds", () => {
    expect(weeklySnapshotCostUsd(0.06)).toBeCloseTo(0.0702);
    expect(dailyDumpTransferGb(0.06)).toBeCloseTo(1.8);
    expect(maximumRetainedDumpGb(0.06)).toBeCloseTo(2.04);
    expect(pitrHistoryCostUsd(0.5)).toBeCloseTo(0.1);
  });

  it("escalates only above the $1 backup or $5 total thresholds", () => {
    expect(
      shouldReduceNeonRecovery({
        projectedBackupCostUsd: 1,
        projectedTotalNeonCostUsd: 5,
      }),
    ).toBe(false);
    expect(
      shouldReduceNeonRecovery({
        projectedBackupCostUsd: 1.01,
        projectedTotalNeonCostUsd: 4,
      }),
    ).toBe(true);
    expect(
      shouldReduceNeonRecovery({
        projectedBackupCostUsd: 0.5,
        projectedTotalNeonCostUsd: 5.01,
      }),
    ).toBe(true);
  });
});
