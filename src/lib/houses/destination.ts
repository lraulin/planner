/**
 * Lee's parents' house. Coordinates resolved once via Nominatim rather than at runtime —
 * it halves the failure surface of every route, and it moves roughly never.
 */
export const DRIVE_DESTINATION = {
  label: "Parents' house",
  address: "5006 Valley Drive, Chesapeake Beach, MD 20732",
  lat: 38.6301284,
  lon: -76.5168522,
} as const;
