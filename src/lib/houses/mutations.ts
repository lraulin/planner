import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { HOUSE_STATUSES, houses, type HouseStatus } from "@/db/schema";
import { between } from "@/lib/tree/sortKey";
import { DRIVE_DESTINATION } from "./destination";
import { driveRoute, geocode } from "./geo";
import { addressKey, needsRoute } from "./route";
import type { HouseInput } from "./types";

/** Houses are standalone records. Every write scopes by `userId`. */

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

async function requireHouse(tx: Executor, userId: string, houseId: string) {
  const [row] = await tx
    .select()
    .from(houses)
    .where(and(eq(houses.id, houseId), eq(houses.userId, userId)))
    .limit(1);
  if (!row) throw new Error("House not found.");
  return row;
}

async function nextSortKey(tx: Executor, userId: string): Promise<string> {
  const siblings = await tx
    .select({ sortKey: houses.sortKey })
    .from(houses)
    .where(eq(houses.userId, userId))
    .orderBy(asc(houses.sortKey));
  return between(siblings[siblings.length - 1]?.sortKey ?? null, null);
}

function requireStatus(
  raw: HouseStatus | undefined,
  fallback: HouseStatus,
): HouseStatus {
  if (raw === undefined) return fallback;
  if (!HOUSE_STATUSES.includes(raw)) {
    throw new Error(`Status must be one of ${HOUSE_STATUSES.join(", ")}.`);
  }
  return raw;
}

function numericString(n: number | null, label: string): string | null {
  if (n === null) return null;
  if (!Number.isFinite(n)) throw new Error(`${label} must be a finite number.`);
  return String(n);
}

function centsValue(n: number | null, label: string): number | null {
  if (n === null) return null;
  if (!Number.isInteger(n))
    throw new Error(`${label} must be a whole number of cents.`);
  return n;
}

/** Fields shared verbatim by insert and update; applies only what the caller set. */
function patchOptionalFields(patch: Record<string, unknown>, input: HouseInput) {
  if (input.askingPriceCents !== undefined) {
    patch.askingPriceCents = centsValue(input.askingPriceCents, "Asking price");
  }
  if (input.hoaFeeCents !== undefined) {
    patch.hoaFeeCents = centsValue(input.hoaFeeCents, "HOA fee");
  }
  if (input.propertyTaxCents !== undefined) {
    patch.propertyTaxCents = centsValue(input.propertyTaxCents, "Property tax");
  }
  if (input.squareFeet !== undefined) patch.squareFeet = input.squareFeet;
  if (input.beds !== undefined) patch.beds = input.beds;
  if (input.baths !== undefined) patch.baths = numericString(input.baths, "Baths");
  if (input.yearBuilt !== undefined) patch.yearBuilt = input.yearBuilt;
  if (input.lotAcres !== undefined)
    patch.lotAcres = numericString(input.lotAcres, "Lot acres");
  if (input.hasFence !== undefined) patch.hasFence = input.hasFence;
  if (input.hasBasement !== undefined) patch.hasBasement = input.hasBasement;
  if (input.hasGarage !== undefined) patch.hasGarage = input.hasGarage;
  if (input.notes !== undefined) patch.notes = input.notes;
}

function inputAddress(input: HouseInput) {
  return {
    streetAddress: input.streetAddress ?? "",
    city: input.city ?? "",
    state: input.state ?? "",
    postalCode: input.postalCode ?? "",
    routedAddress: null,
  };
}

export async function createHouse(
  userId: string,
  input: HouseInput = {},
): Promise<string> {
  return (await createHouseOnce(userId, input)).id;
}

export async function createHouseOnce(
  userId: string,
  input: HouseInput = {},
): Promise<{ id: string; created: boolean }> {
  const result = await db.transaction(async (tx) => {
    if (input.external) {
      const [existing] = await tx
        .select({ id: houses.id })
        .from(houses)
        .where(
          and(
            eq(houses.userId, userId),
            eq(houses.externalSource, input.external.source),
            eq(houses.externalId, input.external.id),
          ),
        )
        .limit(1);
      if (existing) return { id: existing.id, created: false };
    }

    const sortKey = await nextSortKey(tx, userId);
    const patch: Record<string, unknown> = {};
    patchOptionalFields(patch, input);

    // `?? null` folds "omitted" and "explicitly null" together before the rank check, so
    // a rank without a letter (either way of not having one) never reaches the insert —
    // the alternative, checking `input.priorityLetter === null`, misses the omitted case
    // and can violate `houses_priority_letter_ranked`.
    const priorityLetter = input.priorityLetter ?? null;
    const [row] = await tx
      .insert(houses)
      .values({
        userId,
        nickname: input.nickname ?? "",
        listingUrl: input.listingUrl ?? "",
        streetAddress: input.streetAddress ?? "",
        city: input.city ?? "",
        state: input.state ?? "",
        postalCode: input.postalCode ?? "",
        status: requireStatus(input.status, "available"),
        priorityLetter,
        priorityRank: priorityLetter === null ? null : (input.priorityRank ?? null),
        sortKey,
        externalSource: input.external?.source ?? null,
        externalId: input.external?.id ?? null,
        ...patch,
      })
      .onConflictDoNothing()
      .returning({ id: houses.id });

    if (row) return { id: row.id, created: true };
    if (!input.external) throw new Error("House could not be created.");
    const [existing] = await tx
      .select({ id: houses.id })
      .from(houses)
      .where(
        and(
          eq(houses.userId, userId),
          eq(houses.externalSource, input.external.source),
          eq(houses.externalId, input.external.id),
        ),
      )
      .limit(1);
    if (!existing) throw new Error("House could not be created.");
    return { id: existing.id, created: false };
  });

  if (result.created && needsRoute(inputAddress(input))) {
    await refreshHouseRoute(userId, result.id);
  }
  return result;
}

export async function updateHouse(
  userId: string,
  houseId: string,
  input: HouseInput,
): Promise<void> {
  const after = await db.transaction(async (tx) => {
    const existing = await requireHouse(tx, userId, houseId);

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.nickname !== undefined) patch.nickname = input.nickname;
    if (input.listingUrl !== undefined) patch.listingUrl = input.listingUrl;
    if (input.streetAddress !== undefined) patch.streetAddress = input.streetAddress;
    if (input.city !== undefined) patch.city = input.city;
    if (input.state !== undefined) patch.state = input.state;
    if (input.postalCode !== undefined) patch.postalCode = input.postalCode;
    if (input.status !== undefined) {
      patch.status = requireStatus(input.status, existing.status as HouseStatus);
    }
    if (input.priorityLetter !== undefined) {
      patch.priorityLetter = input.priorityLetter;
      if (input.priorityLetter === null) patch.priorityRank = null;
    }
    // The letter this row will have once the patch applies — from the input when it set
    // one, otherwise whatever is already stored — not just `input.priorityLetter`, which
    // is `undefined` (not `null`) when the caller left it alone.
    const resultingLetter =
      input.priorityLetter !== undefined
        ? input.priorityLetter
        : existing.priorityLetter;
    if (input.priorityRank !== undefined && resultingLetter !== null) {
      patch.priorityRank = input.priorityRank;
    }
    patchOptionalFields(patch, input);

    await tx
      .update(houses)
      .set(patch)
      .where(and(eq(houses.id, houseId), eq(houses.userId, userId)));

    return {
      streetAddress: input.streetAddress ?? existing.streetAddress,
      city: input.city ?? existing.city,
      state: input.state ?? existing.state,
      postalCode: input.postalCode ?? existing.postalCode,
      routedAddress: existing.routedAddress,
    };
  });

  if (needsRoute(after)) await refreshHouseRoute(userId, houseId);
}

export async function deleteHouse(userId: string, houseId: string): Promise<void> {
  const deleted = await db
    .delete(houses)
    .where(and(eq(houses.id, houseId), eq(houses.userId, userId)))
    .returning({ id: houses.id });
  if (deleted.length === 0) throw new Error("House not found.");
}

/**
 * Geocode the house's address and route it to `DRIVE_DESTINATION`, or record why not.
 *
 * Deliberately outside any SQL transaction: the network calls it makes can take up to
 * ~8s combined, and holding a Postgres transaction open for that long is worse than the
 * small window in which the row briefly has a stale `routedAddress`.
 */
export async function refreshHouseRoute(
  userId: string,
  houseId: string,
): Promise<void> {
  const row = await requireHouse(db, userId, houseId);
  const key = addressKey(row);
  if (key === "") return;

  const origin = await geocode(
    `${row.streetAddress}, ${row.city}, ${row.state} ${row.postalCode}`,
  );
  if (!origin) {
    await db
      .update(houses)
      .set({ routeError: "Could not find that address.", updatedAt: new Date() })
      .where(and(eq(houses.id, houseId), eq(houses.userId, userId)));
    return;
  }

  const route = await driveRoute(origin, {
    lat: DRIVE_DESTINATION.lat,
    lon: DRIVE_DESTINATION.lon,
  });
  if (!route) {
    await db
      .update(houses)
      .set({
        routeError: "Could not compute a drive time to it.",
        updatedAt: new Date(),
      })
      .where(and(eq(houses.id, houseId), eq(houses.userId, userId)));
    return;
  }

  await db
    .update(houses)
    .set({
      latitude: String(origin.lat),
      longitude: String(origin.lon),
      driveMeters: route.meters,
      driveSeconds: route.seconds,
      routedAddress: key,
      routeError: null,
      updatedAt: new Date(),
    })
    .where(and(eq(houses.id, houseId), eq(houses.userId, userId)));
}
