import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { residences } from "@/db/schema";
import { formatPostalAddress } from "@/lib/address";
import type { ResidenceDetail, ResidenceListRow } from "./types";

function toDetail(row: typeof residences.$inferSelect): ResidenceDetail {
  return {
    id: row.id,
    label: row.label,
    streetAddress: row.streetAddress,
    extendedAddress: row.extendedAddress,
    city: row.city,
    region: row.region,
    postalCode: row.postalCode,
    country: row.country,
    countryCode: row.countryCode,
    movedIn: row.movedIn,
    movedOut: row.movedOut,
    housingType: row.housingType,
    monthlyRent: row.monthlyRent,
    reasonForLeaving: row.reasonForLeaving,
    landlordName: row.landlordName,
    landlordPhone: row.landlordPhone,
    landlordEmail: row.landlordEmail,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toListRow(row: ResidenceDetail): ResidenceListRow {
  return { ...row, address: formatPostalAddress(row) };
}

/**
 * Every residence, most recent move-in first; undated records sort last.
 *
 * Duration is computed on the client — see the same note on `jobs/queries.ts`.
 */
export async function listResidences(userId: string): Promise<ResidenceListRow[]> {
  const rows = await db.select().from(residences).where(eq(residences.userId, userId));
  return rows
    .map((row) => toListRow(toDetail(row)))
    .sort((a, b) => {
      if (a.movedIn === b.movedIn) return a.city.localeCompare(b.city);
      if (!a.movedIn) return 1;
      if (!b.movedIn) return -1;
      return b.movedIn.localeCompare(a.movedIn);
    });
}

/** One residence, scoped to the signed-in user. */
export async function getResidenceDetail(
  userId: string,
  residenceId: string,
): Promise<ResidenceDetail | null> {
  const [row] = await db
    .select()
    .from(residences)
    .where(and(eq(residences.id, residenceId), eq(residences.userId, userId)))
    .limit(1);
  return row ? toDetail(row) : null;
}

/** The dated fields the chronology needs, plus enough of the address to name the place. */
export async function listResidenceDates(userId: string) {
  return db
    .select({
      id: residences.id,
      label: residences.label,
      streetAddress: residences.streetAddress,
      extendedAddress: residences.extendedAddress,
      city: residences.city,
      region: residences.region,
      postalCode: residences.postalCode,
      country: residences.country,
      movedIn: residences.movedIn,
      movedOut: residences.movedOut,
    })
    .from(residences)
    .where(eq(residences.userId, userId));
}
