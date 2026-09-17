/**
 * Agent tools over the Houses catalog: list, read, create, update, and delete.
 *
 * Handlers call only `src/lib/houses/{queries,mutations}` — never the database directly,
 * never a server action. Drive-time routing itself is not a tool: it runs automatically
 * on create/update when the address changes, and a failed route surfaces as `routeError`
 * on the detail, which is enough for Grok to know and mention without a retry knob.
 */

import { HOUSE_STATUSES, type HouseStatus } from "@/db/schema";
import { createHouseOnce, deleteHouse, updateHouse } from "@/lib/houses/mutations";
import { getHouseDetail, listHouses } from "@/lib/houses/queries";
import type { HouseDetail, HouseInput, HouseListRow } from "@/lib/houses/types";
import { AgentError } from "./errors";
import { pageBounds, paginate } from "./pagination";
import {
  optionalExternalRef,
  optionalNumber,
  optionalString,
  parsePriorityLetter,
  requireString,
} from "./parse";

function parseHouseStatus(value: unknown, field = "status"): HouseStatus {
  if (typeof value !== "string" || !HOUSE_STATUSES.includes(value as HouseStatus)) {
    throw new AgentError(
      "validation",
      `${field} must be one of: ${HOUSE_STATUSES.join(", ")}`,
    );
  }
  return value as HouseStatus;
}

function optionalNullableNumber(
  obj: Record<string, unknown>,
  key: string,
): number | null | undefined {
  if (!(key in obj)) return undefined;
  const v = obj[key];
  if (v === null) return null;
  if (typeof v !== "number" || Number.isNaN(v)) {
    throw new AgentError("validation", `${key} must be a number or null`);
  }
  return v;
}

function optionalNullableBoolean(
  obj: Record<string, unknown>,
  key: string,
): boolean | null | undefined {
  if (!(key in obj)) return undefined;
  const v = obj[key];
  if (v === null) return null;
  if (typeof v !== "boolean") {
    throw new AgentError("validation", `${key} must be a boolean or null`);
  }
  return v;
}

function houseSummary(row: HouseListRow) {
  return {
    id: row.id,
    nickname: row.nickname,
    status: row.status,
    priorityLetter: row.priorityLetter,
    priorityRank: row.priorityRank,
    streetAddress: row.streetAddress,
    city: row.city,
    state: row.state,
    askingPriceCents: row.askingPriceCents,
    squareFeet: row.squareFeet,
    beds: row.beds,
    baths: row.baths,
    pricePerSqft: row.pricePerSqft,
    driveMinutes: row.driveMinutes,
    driveMiles: row.driveMiles,
  };
}

function houseDetail(row: HouseDetail) {
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
    status: row.status,
    priorityLetter: row.priorityLetter,
    priorityRank: row.priorityRank,
    notes: row.notes,
    driveMeters: row.driveMeters,
    driveSeconds: row.driveSeconds,
    routeError: row.routeError,
  };
}

/** Every field but `external` — shared by create and update, which treat it differently. */
function houseInputFromArgs(args: Record<string, unknown>): HouseInput {
  const input: HouseInput = {};
  if (args.nickname !== undefined) {
    input.nickname = optionalString(args, "nickname") ?? "";
  }
  if (args.listingUrl !== undefined) {
    input.listingUrl = optionalString(args, "listingUrl") ?? "";
  }
  if (args.streetAddress !== undefined) {
    input.streetAddress = optionalString(args, "streetAddress") ?? "";
  }
  if (args.city !== undefined) input.city = optionalString(args, "city") ?? "";
  if (args.state !== undefined) input.state = optionalString(args, "state") ?? "";
  if (args.postalCode !== undefined) {
    input.postalCode = optionalString(args, "postalCode") ?? "";
  }
  if (args.askingPriceCents !== undefined) {
    input.askingPriceCents = optionalNullableNumber(args, "askingPriceCents") ?? null;
  }
  if (args.hoaFeeCents !== undefined) {
    input.hoaFeeCents = optionalNullableNumber(args, "hoaFeeCents") ?? null;
  }
  if (args.propertyTaxCents !== undefined) {
    input.propertyTaxCents = optionalNullableNumber(args, "propertyTaxCents") ?? null;
  }
  if (args.squareFeet !== undefined) {
    input.squareFeet = optionalNullableNumber(args, "squareFeet") ?? null;
  }
  if (args.beds !== undefined)
    input.beds = optionalNullableNumber(args, "beds") ?? null;
  if (args.baths !== undefined) {
    input.baths = optionalNullableNumber(args, "baths") ?? null;
  }
  if (args.yearBuilt !== undefined) {
    input.yearBuilt = optionalNullableNumber(args, "yearBuilt") ?? null;
  }
  if (args.lotAcres !== undefined) {
    input.lotAcres = optionalNullableNumber(args, "lotAcres") ?? null;
  }
  if (args.hasFence !== undefined) {
    input.hasFence = optionalNullableBoolean(args, "hasFence") ?? null;
  }
  if (args.hasBasement !== undefined) {
    input.hasBasement = optionalNullableBoolean(args, "hasBasement") ?? null;
  }
  if (args.hasGarage !== undefined) {
    input.hasGarage = optionalNullableBoolean(args, "hasGarage") ?? null;
  }
  if (args.status !== undefined) input.status = parseHouseStatus(args.status);
  if (args.priorityLetter !== undefined) {
    input.priorityLetter = parsePriorityLetter(args.priorityLetter);
  }
  if (args.priorityRank !== undefined) {
    input.priorityRank = optionalNullableNumber(args, "priorityRank") ?? null;
  }
  if (args.notes !== undefined) input.notes = optionalString(args, "notes") ?? "";
  return input;
}

export async function listHousesTool(userId: string, args: Record<string, unknown>) {
  const bounds = pageBounds(
    optionalNumber(args, "offset"),
    optionalNumber(args, "limit"),
  );
  const status = args.status === undefined ? undefined : parseHouseStatus(args.status);
  const query = optionalString(args, "query")?.trim().toLowerCase();

  let rows = await listHouses(userId);
  if (status) rows = rows.filter((row) => row.status === status);
  if (query) {
    rows = rows.filter((row) =>
      `${row.nickname} ${row.streetAddress} ${row.city} ${row.state} ${row.notes}`
        .toLowerCase()
        .includes(query),
    );
  }

  const page = paginate(rows, bounds);
  return { houses: page.items.map(houseSummary), pageInfo: page.pageInfo };
}

export async function getHouseTool(userId: string, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  const detail = await getHouseDetail(userId, id);
  if (!detail) throw new AgentError("not_found", `House not found: ${id}`);
  return { house: houseDetail(detail) };
}

export async function createHouseTool(userId: string, args: Record<string, unknown>) {
  const input = houseInputFromArgs(args);
  input.external = optionalExternalRef(args);
  const result = await createHouseOnce(userId, input);
  const payload = (await getHouseTool(userId, { id: result.id })) as { house: unknown };
  return { house: payload.house, created: result.created };
}

export async function updateHouseTool(userId: string, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  await getHouseTool(userId, { id });
  const input = houseInputFromArgs(args);
  if (Object.keys(input).length === 0) {
    throw new AgentError("validation", "Provide at least one field to update");
  }
  await updateHouse(userId, id, input);
  return getHouseTool(userId, { id });
}

export async function deleteHouseTool(userId: string, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  await deleteHouse(userId, id);
  return { deleted: true, id };
}
