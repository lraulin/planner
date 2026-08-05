import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { resources } from "@/db/schema";
import { loadContactOptions } from "@/lib/contacts/queries";
import { weeklyAvailableMinutes, weeklyWorkingMinutes } from "./capacity";
import type { ResourceDetail, ResourceListRow } from "./types";

function numberValue(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDetail(
  row: typeof resources.$inferSelect,
  contactName: string | null,
): ResourceDetail {
  return {
    id: row.id,
    shortName: row.shortName,
    description: row.description,
    contactId: row.contactId,
    contactName,
    overheadPercent: numberValue(row.overheadPercent),
    effectivenessPercent: numberValue(row.effectivenessPercent),
    mondayMinutes: row.mondayMinutes,
    tuesdayMinutes: row.tuesdayMinutes,
    wednesdayMinutes: row.wednesdayMinutes,
    thursdayMinutes: row.thursdayMinutes,
    fridayMinutes: row.fridayMinutes,
    saturdayMinutes: row.saturdayMinutes,
    sundayMinutes: row.sundayMinutes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** All resources, alphabetized by their short scheduling name. */
export async function listResources(userId: string): Promise<ResourceListRow[]> {
  const [rows, contacts] = await Promise.all([
    db.select().from(resources).where(eq(resources.userId, userId)),
    loadContactOptions(userId),
  ]);
  const contactNames = new Map(
    contacts.map((contact) => [contact.id, contact.displayName]),
  );

  return rows
    .map((row) => {
      const detail = toDetail(
        row,
        row.contactId ? (contactNames.get(row.contactId) ?? null) : null,
      );
      return {
        ...detail,
        weeklyWorkingMinutes: weeklyWorkingMinutes(detail),
        weeklyAvailableMinutes: weeklyAvailableMinutes(detail),
      };
    })
    .sort((a, b) =>
      a.shortName.localeCompare(b.shortName, undefined, { sensitivity: "base" }),
    );
}

/** One resource, scoped to the signed-in user. */
export async function getResourceDetail(
  userId: string,
  resourceId: string,
): Promise<ResourceDetail | null> {
  const [matches, contacts] = await Promise.all([
    db
      .select()
      .from(resources)
      .where(and(eq(resources.id, resourceId), eq(resources.userId, userId)))
      .limit(1),
    loadContactOptions(userId),
  ]);
  const row = matches[0];
  if (!row) return null;
  const contactName = row.contactId
    ? (contacts.find((contact) => contact.id === row.contactId)?.displayName ?? null)
    : null;
  return toDetail(row, contactName);
}
