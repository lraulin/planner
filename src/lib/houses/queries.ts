import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { houses, type HouseStatus } from "@/db/schema";
import type { HouseDetail, HouseListRow } from "./types";

function toDetail(row: typeof houses.$inferSelect): HouseDetail {
  return {
    id: row.id,
    nickname: row.nickname,
    listingUrl: row.listingUrl,
    streetAddress: row.streetAddress,
    city: row.city,
    state: row.state,
    postalCode: row.postalCode,
    askingPriceCents: row.askingPriceCents,
    hoaFeeCents: row.hoaFeeCents,
    propertyTaxCents: row.propertyTaxCents,
    squareFeet: row.squareFeet,
    beds: row.beds,
    baths: row.baths,
    yearBuilt: row.yearBuilt,
    lotAcres: row.lotAcres,
    hasFence: row.hasFence,
    hasBasement: row.hasBasement,
    hasGarage: row.hasGarage,
    status: row.status as HouseStatus,
    priorityLetter: row.priorityLetter,
    priorityRank: row.priorityRank,
    notes: row.notes,
    latitude: row.latitude,
    longitude: row.longitude,
    driveMeters: row.driveMeters,
    driveSeconds: row.driveSeconds,
    routedAddress: row.routedAddress,
    routeError: row.routeError,
    sortKey: row.sortKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Dollars per square foot, rounded to the cent. Null unless both inputs are usable. */
function pricePerSqft(
  askingPriceCents: number | null,
  squareFeet: number | null,
): number | null {
  if (askingPriceCents === null || !squareFeet) return null;
  return Math.round(askingPriceCents / squareFeet) / 100;
}

function toListRow(row: HouseDetail): HouseListRow {
  return {
    ...row,
    pricePerSqft: pricePerSqft(row.askingPriceCents, row.squareFeet),
    driveMinutes: row.driveSeconds === null ? null : Math.round(row.driveSeconds / 60),
    driveMiles: row.driveMeters === null ? null : row.driveMeters / 1609.344,
  };
}

/** Every house for the user, in manual sort order. */
export async function listHouses(userId: string): Promise<HouseListRow[]> {
  const rows = await db
    .select()
    .from(houses)
    .where(eq(houses.userId, userId))
    .orderBy(asc(houses.sortKey));
  return rows.map((row) => toListRow(toDetail(row)));
}

/** One house, scoped to the signed-in user. */
export async function getHouseDetail(
  userId: string,
  houseId: string,
): Promise<HouseDetail | null> {
  const [row] = await db
    .select()
    .from(houses)
    .where(and(eq(houses.id, houseId), eq(houses.userId, userId)))
    .limit(1);
  return row ? toDetail(row) : null;
}
