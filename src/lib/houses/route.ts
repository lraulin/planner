/**
 * Pure logic for the Houses drive-time feature — address normalization, response parsing,
 * and formatting. The impure Nominatim/OSRM calls live in `geo.ts`; nothing here touches
 * the network.
 */

interface HouseAddress {
  streetAddress: string;
  city: string;
  state: string;
  postalCode: string;
}

function normalizePart(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * Normalized `"street, city, state zip"`, lowercased so a case-only edit does not trigger
 * a re-route. The value stored in `routedAddress`. Empty only when every part is blank.
 */
export function addressKey(house: HouseAddress): string {
  const street = normalizePart(house.streetAddress);
  const city = normalizePart(house.city);
  const state = normalizePart(house.state);
  const postalCode = normalizePart(house.postalCode);
  if (!street && !city && !state && !postalCode) return "";
  return `${street}, ${city}, ${state} ${postalCode}`.toLowerCase();
}

/** True when the address has changed since the cached route was computed, and isn't blank. */
export function needsRoute(
  house: HouseAddress & { routedAddress: string | null },
): boolean {
  const key = addressKey(house);
  return key !== "" && key !== house.routedAddress;
}

/** Nominatim's `/search?format=jsonv2` response: an array, `lat`/`lon` as strings. */
export function parseNominatim(json: unknown): { lat: number; lon: number } | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  const first = json[0];
  if (typeof first !== "object" || first === null) return null;
  const { lat, lon } = first as Record<string, unknown>;
  if (typeof lat !== "string" && typeof lat !== "number") return null;
  if (typeof lon !== "string" && typeof lon !== "number") return null;
  const latNum = Number(lat);
  const lonNum = Number(lon);
  if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) return null;
  return { lat: latNum, lon: lonNum };
}

/** OSRM's `/route/v1/driving/...?overview=false` response. Rounds to whole meters/seconds. */
export function parseOsrm(json: unknown): { meters: number; seconds: number } | null {
  if (typeof json !== "object" || json === null) return null;
  const { routes } = json as Record<string, unknown>;
  if (!Array.isArray(routes) || routes.length === 0) return null;
  const first = routes[0];
  if (typeof first !== "object" || first === null) return null;
  const { distance, duration } = first as Record<string, unknown>;
  if (typeof distance !== "number" || typeof duration !== "number") return null;
  if (!Number.isFinite(distance) || !Number.isFinite(duration)) return null;
  return { meters: Math.round(distance), seconds: Math.round(duration) };
}

/**
 * `"42 min"`, `"1 hr"`, `"1 hr 5 min"`. Rounds to the nearest minute first, then carries
 * into hours — so 3599.6s (59:59.6) reads "1 hr", never "60 min".
 */
export function formatDriveTime(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

/** `"23.4 mi"`. */
export function formatMiles(meters: number): string {
  return `${(meters / 1609.344).toFixed(1)} mi`;
}
