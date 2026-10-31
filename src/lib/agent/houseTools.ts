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
  optionalNullableBoolean,
  optionalNullableNumber,
  requireSomeField,
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
  return {
    nickname: optionalString(args, "nickname"),
    listingUrl: optionalString(args, "listingUrl"),
    streetAddress: optionalString(args, "streetAddress"),
    city: optionalString(args, "city"),
    state: optionalString(args, "state"),
    postalCode: optionalString(args, "postalCode"),
    askingPriceCents: optionalNullableNumber(args, "askingPriceCents"),
    hoaFeeCents: optionalNullableNumber(args, "hoaFeeCents"),
    propertyTaxCents: optionalNullableNumber(args, "propertyTaxCents"),
    squareFeet: optionalNullableNumber(args, "squareFeet"),
    beds: optionalNullableNumber(args, "beds"),
    baths: optionalNullableNumber(args, "baths"),
    yearBuilt: optionalNullableNumber(args, "yearBuilt"),
    lotAcres: optionalNullableNumber(args, "lotAcres"),
    hasFence: optionalNullableBoolean(args, "hasFence"),
    hasBasement: optionalNullableBoolean(args, "hasBasement"),
    hasGarage: optionalNullableBoolean(args, "hasGarage"),
    status: args.status === undefined ? undefined : parseHouseStatus(args.status),
    priorityLetter:
      args.priorityLetter === undefined
        ? undefined
        : parsePriorityLetter(args.priorityLetter),
    priorityRank: optionalNullableNumber(args, "priorityRank"),
    notes: optionalString(args, "notes"),
  };
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
  requireSomeField(input);
  await updateHouse(userId, id, input);
  return getHouseTool(userId, { id });
}

export async function deleteHouseTool(userId: string, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  await deleteHouse(userId, id);
  return { deleted: true, id };
}
