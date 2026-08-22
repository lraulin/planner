import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { invites, users } from "@/db/schema";
import { createCredentialUser } from "./provision";

const INVALID_INVITE = "This invite is invalid or has been revoked.";
const CANNOT_INVITE = "This account cannot create invites.";

export type InviteRow = {
  id: string;
  token: string;
  createdAt: Date;
  revokedAt: Date | null;
  useCount: number;
  url: string;
};

/** JSON-safe for the Settings client. */
export type InviteListItem = {
  id: string;
  url: string;
  createdAt: string;
  revokedAt: string | null;
  useCount: number;
};

export function serializeInvite(row: InviteRow): InviteListItem {
  return {
    id: row.id,
    url: row.url,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    useCount: row.useCount,
  };
}

/**
 * Build the URL a guest opens. Origin defaults to `BETTER_AUTH_URL` so a copy from
 * Settings always names the hostname auth belongs to, even when Lee is on an alias.
 */
export function inviteSignupUrl(
  token: string,
  origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3047",
): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/signup?invite=${encodeURIComponent(token)}`;
}

export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function userCanInvite(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ canInvite: users.canInvite })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return Boolean(row?.canInvite);
}

async function requireCanInvite(userId: string): Promise<void> {
  if (!(await userCanInvite(userId))) {
    throw new Error(CANNOT_INVITE);
  }
}

export async function createInvite(userId: string): Promise<InviteRow> {
  await requireCanInvite(userId);
  const token = generateInviteToken();
  const [row] = await db.insert(invites).values({ userId, token }).returning();
  return toInviteRow(row);
}

export async function listInvites(userId: string): Promise<InviteRow[]> {
  const rows = await db
    .select()
    .from(invites)
    .where(eq(invites.userId, userId))
    .orderBy(desc(invites.createdAt));
  return rows.map(toInviteRow);
}

export async function revokeInvite(userId: string, inviteId: string): Promise<void> {
  const [row] = await db
    .update(invites)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(invites.id, inviteId),
        eq(invites.userId, userId),
        isNull(invites.revokedAt),
      ),
    )
    .returning({ id: invites.id });
  if (!row) {
    throw new Error("Invite not found.");
  }
}

export async function isInviteRedeemable(token: string): Promise<boolean> {
  if (!token) return false;
  const [row] = await db
    .select({ id: invites.id })
    .from(invites)
    .where(and(eq(invites.token, token), isNull(invites.revokedAt)))
    .limit(1);
  return Boolean(row);
}

/**
 * Create an empty account from a valid invite. Keyed by token, not by the minter —
 * the new row's `user_id` is the new account, never the person who minted the link.
 */
export async function redeemInvite(input: {
  token: string;
  email: string;
  password: string;
  name?: string;
}): Promise<{ id: string; email: string }> {
  const token = input.token.trim();
  if (!token) {
    throw new Error(INVALID_INVITE);
  }

  const [invite] = await db
    .select({ id: invites.id })
    .from(invites)
    .where(and(eq(invites.token, token), isNull(invites.revokedAt)))
    .limit(1);
  if (!invite) {
    throw new Error(INVALID_INVITE);
  }

  // Create first so a colliding email cannot bump use_count on a failed redeem.
  const created = await createCredentialUser({
    email: input.email,
    password: input.password,
    name: input.name,
    canInvite: false,
  });

  await db
    .update(invites)
    .set({ useCount: sql`${invites.useCount} + 1` })
    .where(and(eq(invites.id, invite.id), isNull(invites.revokedAt)));

  return created;
}

function toInviteRow(row: typeof invites.$inferSelect): InviteRow {
  return {
    id: row.id,
    token: row.token,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt,
    useCount: row.useCount,
    url: inviteSignupUrl(row.token),
  };
}
