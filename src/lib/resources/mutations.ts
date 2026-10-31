import { db } from "@/db";
import type { DbExecutor } from "@/db/executor";
import { resources } from "@/db/schema";
import { ownedRow, requireOwnedRow } from "@/lib/db/owned";
import { assertContactOwned } from "@/lib/contacts/ownership";
import { RESOURCE_MINUTE_FIELDS, type ResourceMinuteField } from "./capacity";
import type { ResourceInput } from "./types";

/** Resources are standalone records. Every write scopes by `userId`. */

async function requireResource(tx: DbExecutor, userId: string, resourceId: string) {
  return requireOwnedRow(tx, resources, resourceId, userId, "Resource not found.");
}

function percentage(value: number, label: string, max: number): number {
  if (!Number.isFinite(value) || value < 0 || value > max) {
    throw new Error(`${label} must be between 0 and ${max}.`);
  }
  return value;
}

function minutes(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number of minutes.`);
  }
  return Math.round(value);
}

function patchMinuteFields(values: Record<string, unknown>, input: ResourceInput) {
  for (const field of RESOURCE_MINUTE_FIELDS) {
    const value = input[field];
    if (value !== undefined) values[field] = minutes(value, dayLabel(field));
  }
}

function dayLabel(field: ResourceMinuteField): string {
  return field.replace("Minutes", "").replace(/^./, (letter) => letter.toUpperCase());
}

export async function createResource(
  userId: string,
  input: ResourceInput = {},
): Promise<string> {
  return db.transaction(async (tx) => {
    await assertContactOwned(tx, userId, input.contactId);
    const dayValues: Record<string, unknown> = {};
    patchMinuteFields(dayValues, input);
    const [row] = await tx
      .insert(resources)
      .values({
        userId,
        shortName: (input.shortName ?? "").trim() || "New Resource",
        description: input.description ?? "",
        contactId: input.contactId ?? null,
        overheadPercent:
          input.overheadPercent === undefined
            ? "0"
            : String(percentage(input.overheadPercent, "Overhead", 100)),
        effectivenessPercent:
          input.effectivenessPercent === undefined
            ? "100"
            : String(percentage(input.effectivenessPercent, "Effectiveness", 10000)),
        ...dayValues,
      })
      .returning({ id: resources.id });
    return row.id;
  });
}

export async function updateResource(
  userId: string,
  resourceId: string,
  input: ResourceInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    await requireResource(tx, userId, resourceId);
    if (input.contactId !== undefined)
      await assertContactOwned(tx, userId, input.contactId);

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.shortName !== undefined) {
      const name = input.shortName.trim();
      if (!name) throw new Error("Resource name is required.");
      patch.shortName = name;
    }
    if (input.description !== undefined) patch.description = input.description;
    if (input.contactId !== undefined) patch.contactId = input.contactId;
    if (input.overheadPercent !== undefined) {
      patch.overheadPercent = String(
        percentage(input.overheadPercent, "Overhead", 100),
      );
    }
    if (input.effectivenessPercent !== undefined) {
      patch.effectivenessPercent = String(
        percentage(input.effectivenessPercent, "Effectiveness", 10000),
      );
    }
    patchMinuteFields(patch, input);

    await tx
      .update(resources)
      .set(patch)
      .where(ownedRow(resources, resourceId, userId));
  });
}

export async function deleteResource(
  userId: string,
  resourceId: string,
): Promise<void> {
  const deleted = await db
    .delete(resources)
    .where(ownedRow(resources, resourceId, userId))
    .returning({ id: resources.id });
  if (deleted.length === 0) throw new Error("Resource not found.");
}
