import type { SpanDuration } from "@/lib/history/span";

/** The complete Residence record — everything the drawer edits and the grid summarises. */
export type ResidenceDetail = {
  id: string;
  /** An optional nickname — "The Seoul apartment". The address is the identity. */
  label: string;

  streetAddress: string;
  extendedAddress: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  countryCode: string;

  /** `YYYY-MM-DD`, or null while unknown. */
  movedIn: string | null;
  /** `YYYY-MM-DD`. Null means you still live there. */
  movedOut: string | null;
  housingType: string;
  /** A `numeric` string, never a float. See `moneyOrNull`. */
  monthlyRent: string | null;
  reasonForLeaving: string;

  landlordName: string;
  landlordPhone: string;
  landlordEmail: string;

  notes: string;
  createdAt: Date;
  updatedAt: Date;
};

/** What the server sends. Duration is derived on the client — see `JobListRow`. */
export type ResidenceListRow = ResidenceDetail & {
  /** The full address on one line. */
  address: string;
};

/** What the grid renders — the server row plus the derived duration. See `JobGridRow`. */
export type ResidenceGridRow = ResidenceListRow & {
  duration: SpanDuration;
};

/** Partial structured edit; an omitted field is left alone rather than blanked. */
export type ResidenceInput = {
  label?: string;

  streetAddress?: string;
  extendedAddress?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  countryCode?: string;

  movedIn?: string | null;
  movedOut?: string | null;
  housingType?: string;
  monthlyRent?: string | null;
  reasonForLeaving?: string;

  landlordName?: string;
  landlordPhone?: string;
  landlordEmail?: string;

  notes?: string;
};
