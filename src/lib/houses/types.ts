import type { ExternalRef, HouseStatus, PriorityLetter } from "@/db/schema";

export type { HouseStatus };

export const HOUSE_STATUS_LABELS: Record<HouseStatus, string> = {
  available: "Available",
  not_interested: "Not Interested",
  no_longer_available: "No Longer Available",
  offer_made: "Offer Made",
};

/** The complete House record — everything the drawer edits and the grid summarises. */
export type HouseDetail = {
  id: string;
  nickname: string;
  listingUrl: string;

  streetAddress: string;
  city: string;
  state: string;
  postalCode: string;

  askingPriceCents: number | null;
  /** Monthly. */
  hoaFeeCents: number | null;
  /** Annual. */
  propertyTaxCents: number | null;

  squareFeet: number | null;
  beds: number | null;
  /** A `numeric(3,1)` string, e.g. `"2.5"`. */
  baths: string | null;
  yearBuilt: number | null;
  /** A `numeric(6,3)` string. */
  lotAcres: string | null;

  /** Null means "not listed" — a real, common state, distinct from "no". */
  hasFence: boolean | null;
  hasBasement: boolean | null;
  hasGarage: boolean | null;

  status: HouseStatus;
  priorityLetter: PriorityLetter | null;
  priorityRank: number | null;
  notes: string;

  /** `numeric(9,6)` strings, or null before the first successful route. */
  latitude: string | null;
  longitude: string | null;
  driveMeters: number | null;
  driveSeconds: number | null;
  /** The address key the cached route was computed for. See `route.ts#needsRoute`. */
  routedAddress: string | null;
  /** A short human sentence when the last route attempt failed; cleared on success. */
  routeError: string | null;

  sortKey: string;
  createdAt: Date;
  updatedAt: Date;
};

/** One Houses grid row: the record plus values only worth computing once, at read time. */
export type HouseListRow = HouseDetail & {
  /** Dollars per square foot, rounded to the cent. Null unless both inputs are set. */
  pricePerSqft: number | null;
  /** `driveSeconds` in whole minutes, for sorting; formatting is `formatDriveTime`. */
  driveMinutes: number | null;
  /** `driveMeters` in miles, for sorting; formatting is `formatMiles`. */
  driveMiles: number | null;
};

/**
 * Partial structured edit; an omitted field is left alone rather than blanked. Route-cache
 * fields (`latitude`, `driveSeconds`, `routedAddress`, `routeError`, …) are not here —
 * only `refreshHouseRoute` writes them.
 */
export type HouseInput = {
  nickname?: string;
  listingUrl?: string;

  streetAddress?: string;
  city?: string;
  state?: string;
  postalCode?: string;

  askingPriceCents?: number | null;
  hoaFeeCents?: number | null;
  propertyTaxCents?: number | null;

  squareFeet?: number | null;
  beds?: number | null;
  baths?: number | null;
  yearBuilt?: number | null;
  lotAcres?: number | null;

  hasFence?: boolean | null;
  hasBasement?: boolean | null;
  hasGarage?: boolean | null;

  status?: HouseStatus;
  priorityLetter?: PriorityLetter | null;
  priorityRank?: number | null;
  notes?: string;

  external?: ExternalRef;
};
