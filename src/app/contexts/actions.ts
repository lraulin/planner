"use server";

import * as contexts from "@/lib/contexts/mutations";
import { listMasterContexts } from "@/lib/contexts/queries";
import { run, runQuery } from "../actionResult";

export async function listMasterContextsAction() {
  return runQuery((userId) => listMasterContexts(userId));
}

export async function addMasterContextAction(name: string) {
  return run((userId) => contexts.addMasterContext(userId, name));
}

export async function deleteMasterContextAction(id: string) {
  return run((userId) => contexts.deleteMasterContext(userId, id));
}
