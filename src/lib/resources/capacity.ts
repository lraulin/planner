/** The seven stored working-day fields, in the order a human reads a week. */
export const RESOURCE_MINUTE_FIELDS = [
  "mondayMinutes",
  "tuesdayMinutes",
  "wednesdayMinutes",
  "thursdayMinutes",
  "fridayMinutes",
  "saturdayMinutes",
  "sundayMinutes",
] as const;

export type ResourceMinuteField = (typeof RESOURCE_MINUTE_FIELDS)[number];

/** The capacity-bearing part of a resource. Kept small so the wizard does not need its UI type. */
export type ResourceCapacity = Record<ResourceMinuteField, number> & {
  overheadPercent: number;
  effectivenessPercent: number;
};

/** Nominal working time before overhead or effectiveness adjustments. */
export function weeklyWorkingMinutes(
  resource: Pick<ResourceCapacity, ResourceMinuteField>,
): number {
  return RESOURCE_MINUTE_FIELDS.reduce(
    (total, key) => total + Math.max(0, resource[key]),
    0,
  );
}

/**
 * Work capacity expressed in average-person minutes for a resource's normal week.
 *
 * Achieve subtracts overhead from actual calendar time, then applies effectiveness to what
 * remains. We preserve that order and round once, at the final minute: rounding an
 * intermediate result means two otherwise identical part-time resources can gain or lose a
 * minute just because their values are stored in different fields.
 */
export function weeklyAvailableMinutes(resource: ResourceCapacity): number {
  const working = weeklyWorkingMinutes(resource);
  const overhead = Math.min(100, Math.max(0, resource.overheadPercent));
  const effectiveness = Math.max(0, resource.effectivenessPercent);
  return Math.round(working * (1 - overhead / 100) * (effectiveness / 100));
}
