import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, resources } from "@/db/schema";
import { RESOURCE_MINUTE_FIELDS, type ResourceMinuteField } from "./capacity";
import type { ResourceInput } from "./types";

/** Resources are standalone records. Every write scopes by `userId`. */

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

async function requireResource(tx: Executor, userId: string, resourceId: string) {
  const [row] = await tx
    .select()
    .from(resources)
    .where(and(eq(resources.id, resourceId), eq(resources.userId, userId)))
    .limit(1);
  if (!row) throw new Error("Resource not found.");
  return row;
}

async function assertContactOwned(
  tx: Executor,
  userId: string,
  contactId: string | null | undefined,
): Promise<void> {
  if (contactId === undefined || contactId === null) return;
  const [contact] = await tx
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)))
    .limit(1);
  if (!contact) throw new Error("Contact not found.");
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
      .where(and(eq(resources.id, resourceId), eq(resources.userId, userId)));
  });
}

export async function deleteResource(
  userId: string,
  resourceId: string,
): Promise<void> {
  const deleted = await db
    .delete(resources)
    .where(and(eq(resources.id, resourceId), eq(resources.userId, userId)))
    .returning({ id: resources.id });
  if (deleted.length === 0) throw new Error("Resource not found.");
}
