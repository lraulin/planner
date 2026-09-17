"use server";

import {
  createHouse,
  deleteHouse,
  refreshHouseRoute,
  updateHouse,
} from "@/lib/houses/mutations";
import { getHouseDetail, listHouses } from "@/lib/houses/queries";
import type { HouseDetail, HouseInput, HouseListRow } from "@/lib/houses/types";
import { run, runQuery, type ActionResult, type QueryResult } from "../../actionResult";

export async function createHouseAction(input?: HouseInput): Promise<ActionResult> {
  return run((userId) => createHouse(userId, input));
}

export async function updateHouseAction(
  houseId: string,
  input: HouseInput,
): Promise<ActionResult> {
  return run((userId) => updateHouse(userId, houseId, input));
}

export async function deleteHouseAction(houseId: string): Promise<ActionResult> {
  return run((userId) => deleteHouse(userId, houseId));
}

/** The retry path for a failed geocode/route — the row menu's "Recalculate drive time". */
export async function refreshHouseRouteAction(houseId: string): Promise<ActionResult> {
  return run((userId) => refreshHouseRoute(userId, houseId));
}

export async function listHousesAction(): Promise<QueryResult<HouseListRow[]>> {
  return runQuery(listHouses);
}

export async function getHouseDetailAction(
  houseId: string,
): Promise<QueryResult<HouseDetail | null>> {
  return runQuery((userId) => getHouseDetail(userId, houseId));
}
