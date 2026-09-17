/**
 * Thin Nominatim/OSRM client. The only impure part of `src/lib/houses/` — everything
 * decidable without a network round trip lives in `route.ts`, which is pure and tested.
 *
 * Deliberately untested, in the shape of `src/lib/banksync/client.ts`. Both calls return
 * `null` on any non-200, timeout, or unparseable body: the caller saves the house either
 * way and surfaces `routeError` for a retry.
 */

import { parseNominatim, parseOsrm } from "./route";

const FETCH_TIMEOUT_MS = 4_000;
const USER_AGENT = "planner/1.0 (personal use; leeraulin@gmail.com)";

export interface LatLon {
  lat: number;
  lon: number;
}

export interface DriveRoute {
  meters: number;
  seconds: number;
}

/**
 * Geocode a free-typed address via Nominatim. Nominatim's usage policy requires a real
 * `User-Agent` and caps at 1 req/sec — fine for a handful of houses one at a time, but
 * never loop this without a delay between calls.
 */
export async function geocode(address: string): Promise<LatLon | null> {
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
    format: "jsonv2",
    limit: "1",
    q: address,
  })}`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT },
    });
    if (!response.ok) return null;
    return parseNominatim(await response.json());
  } catch {
    return null;
  }
}

/** Driving distance/duration between two points via the OSRM demo server. No SLA. */
export async function driveRoute(from: LatLon, to: LatLon): Promise<DriveRoute | null> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT },
    });
    if (!response.ok) return null;
    return parseOsrm(await response.json());
  } catch {
    return null;
  }
}
