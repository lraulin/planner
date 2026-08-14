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
  monthlyRent: number | null;
  reasonForLeaving: string;

  landlordName: string;
  landlordPhone: string;
  landlordEmail: string;

  notes: string;
  createdAt: Date;
  updatedAt: Date;
};

/** One Residences grid row: the record plus what the grid computes rather than stores. */
export type ResidenceListRow = ResidenceDetail & {
  /** The full address on one line. */
  address: string;
  /** `"2y 7m 3d"`, or null when there is no move-in date to measure from. */
  duration: string | null;
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
  monthlyRent?: number | null;
  reasonForLeaving?: string;

  landlordName?: string;
  landlordPhone?: string;
  landlordEmail?: string;

  notes?: string;
};
