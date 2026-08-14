/**
 * Rendering a postal address as one line.
 *
 * Shared because three surfaces now hold an address in the same seven columns — contact
 * items, jobs and residences — and "which parts, in what order, separated by what" is one
 * rule, not three. The column names come from Google People via `contact_items`, which is
 * why they are already not US-shaped: `region` is a state, a province, a prefecture or
 * nothing, and Korea has no ZIP.
 */
export type PostalAddressParts = {
  streetAddress: string;
  /** Apartment, suite, floor. Absent on contact items, which never had the column. */
  extendedAddress?: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};

/**
 * `"12 Baker St, Apt 3, London, Greater London, NW1 6XE, United Kingdom"`, skipping every
 * part that is blank — which is most of them on most records, and all of them on a new one.
 *
 * City and region are joined first so they read as one place before the separator logic
 * flattens everything, and an address with only a city does not come out as ", London,".
 */
export function formatPostalAddress(parts: PostalAddressParts): string {
  const cityLine = [parts.city, parts.region]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");

  return [
    parts.streetAddress,
    parts.extendedAddress ?? "",
    cityLine,
    parts.postalCode,
    parts.country,
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}
