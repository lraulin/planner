"use server";

import {
  createResidence,
  deleteResidence,
  updateResidence,
} from "@/lib/residences/mutations";
import { getResidenceDetail, listResidences } from "@/lib/residences/queries";
import type {
  ResidenceDetail,
  ResidenceInput,
  ResidenceListRow,
} from "@/lib/residences/types";
import { run, runQuery, type ActionResult, type QueryResult } from "../../actionResult";

export async function createResidenceAction(
  input?: ResidenceInput,
): Promise<ActionResult> {
  return run((userId) => createResidence(userId, input));
}

export async function updateResidenceAction(
  residenceId: string,
  input: ResidenceInput,
): Promise<ActionResult> {
  return run((userId) => updateResidence(userId, residenceId, input));
}

export async function deleteResidenceAction(
  residenceId: string,
): Promise<ActionResult> {
  return run((userId) => deleteResidence(userId, residenceId));
}

export async function listResidencesAction(): Promise<QueryResult<ResidenceListRow[]>> {
  return runQuery(listResidences);
}

export async function getResidenceDetailAction(
  residenceId: string,
): Promise<QueryResult<ResidenceDetail | null>> {
  return runQuery((userId) => getResidenceDetail(userId, residenceId));
}
