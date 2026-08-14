import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { residences } from "@/db/schema";
import {
  dateKeyOrNull,
  moneyOrNull,
  patchText,
  requireOrderedDates,
} from "@/lib/history/fields";
import type { ResidenceInput } from "./types";

/** Residences are standalone records. Every write scopes by `userId`. */

const TEXT_FIELDS = [
  "label",
  "streetAddress",
  "extendedAddress",
  "city",
  "region",
  "postalCode",
  "country",
  "countryCode",
  "housingType",
  "reasonForLeaving",
  "landlordName",
  "landlordPhone",
  "landlordEmail",
  "notes",
] as const;

const DATE_LABELS = { start: "Moved in", end: "Moved out" };

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

async function requireResidence(tx: Executor, userId: string, residenceId: string) {
  const [row] = await tx
    .select()
    .from(residences)
    .where(and(eq(residences.id, residenceId), eq(residences.userId, userId)))
    .limit(1);
  if (!row) throw new Error("Residence not found.");
  return row;
}

export async function createResidence(
  userId: string,
  input: ResidenceInput = {},
): Promise<string> {
  const movedIn = dateKeyOrNull(input.movedIn, DATE_LABELS.start);
  const movedOut = dateKeyOrNull(input.movedOut, DATE_LABELS.end);
  requireOrderedDates(movedIn, movedOut, DATE_LABELS);

  const text: Record<string, unknown> = {};
  patchText(text, input, TEXT_FIELDS);

  const [row] = await db
    .insert(residences)
    .values({
      userId,
      ...text,
      movedIn,
      movedOut,
      monthlyRent: moneyOrNull(input.monthlyRent, "Monthly rent"),
    })
    .returning({ id: residences.id });
  return row.id;
}

export async function updateResidence(
  userId: string,
  residenceId: string,
  input: ResidenceInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const existing = await requireResidence(tx, userId, residenceId);

    // Checked against the record as it will be — see the same note in `jobs/mutations.ts`.
    const movedIn =
      input.movedIn === undefined
        ? existing.movedIn
        : dateKeyOrNull(input.movedIn, DATE_LABELS.start);
    const movedOut =
      input.movedOut === undefined
        ? existing.movedOut
        : dateKeyOrNull(input.movedOut, DATE_LABELS.end);
    requireOrderedDates(movedIn, movedOut, DATE_LABELS);

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    patchText(patch, input, TEXT_FIELDS);
    if (input.movedIn !== undefined) patch.movedIn = movedIn;
    if (input.movedOut !== undefined) patch.movedOut = movedOut;
    if (input.monthlyRent !== undefined) {
      patch.monthlyRent = moneyOrNull(input.monthlyRent, "Monthly rent");
    }

    await tx
      .update(residences)
      .set(patch)
      .where(and(eq(residences.id, residenceId), eq(residences.userId, userId)));
  });
}

export async function deleteResidence(
  userId: string,
  residenceId: string,
): Promise<void> {
  const deleted = await db
    .delete(residences)
    .where(and(eq(residences.id, residenceId), eq(residences.userId, userId)))
    .returning({ id: residences.id });
  if (deleted.length === 0) throw new Error("Residence not found.");
}
