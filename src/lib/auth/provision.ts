import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, users } from "@/db/schema";
import { normalizeEmail } from "@/lib/auth/identity";
import { MIN_PASSWORD_LENGTH } from "./passwordPolicy";

export { MIN_PASSWORD_LENGTH };

/**
 * Account provisioning, without Better Auth's public sign-up endpoint.
 *
 * `disableSignUp` stays true in `@/lib/auth/server`, so `/api/auth/sign-up/email` cannot
 * create accounts. This module writes the two rows Better Auth needs for a credential
 * login — the `users` row and an `accounts` row with `providerId: "credential"`.
 *
 * Two callers:
 * - `upsertUser` / `npm run user:create` — admin path; sets `can_invite`.
 * - `createCredentialUser` — invite redeem; `can_invite` stays false.
 */

export type UpsertUserInput = {
  email: string;
  password: string;
  name?: string;
  /**
   * Rename an existing account to `email` instead of creating a new one, keeping the same
   * `users.id`. Every scoped table cascades on that id and the linked Google `accounts` row
   * hangs off it, so a rename must never be delete-and-recreate.
   */
  renameFrom?: string;
};

export type UpsertUserOutcome = "created" | "updated" | "renamed";

export type UpsertUserResult = {
  id: string;
  email: string;
  outcome: UpsertUserOutcome;
};

/**
 * Better Auth validates addresses with `z.email()`, which rejects bare `*@localhost` — the
 * reason this project's original `dev@localhost` seed user had to be renamed. Keep the check
 * loose otherwise; the authority on what is acceptable is Better Auth at sign-in, not us.
 */
function assertUsableEmail(email: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(
      `"${email}" is not an address Better Auth will accept. It needs a dotted domain — "user@example.com", not "user@localhost".`,
    );
  }
}

function assertUsablePassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
}

async function findIdByEmail(email: string): Promise<string | null> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Create an account, update its name/password, or rename it — idempotently.
 *
 * Re-running with the same arguments is always safe: it resets the password to the one
 * given and changes nothing else. A `renameFrom` whose account no longer exists is a
 * completed rename, not an error, so a repeated command converges instead of failing.
 */
export async function upsertUser({
  email,
  password,
  name,
  renameFrom,
}: UpsertUserInput): Promise<UpsertUserResult> {
  const target = normalizeEmail(email);
  const previous = renameFrom ? normalizeEmail(renameFrom) : null;

  assertUsableEmail(target);
  assertUsablePassword(password);

  let outcome: UpsertUserOutcome | null = null;
  let userId: string | null = null;

  if (previous && previous !== target) {
    const previousId = await findIdByEmail(previous);
    if (previousId) {
      const clashingId = await findIdByEmail(target);
      if (clashingId && clashingId !== previousId) {
        throw new Error(
          `Cannot rename ${previous} to ${target}: a different account already uses that address. Merging two accounts' data is not something this script will guess at.`,
        );
      }
      await db
        .update(users)
        .set({
          email: target,
          ...(name ? { name } : {}),
          emailVerified: true,
          canInvite: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, previousId));
      userId = previousId;
      outcome = "renamed";
    }
  }

  if (!userId) {
    const existingId = await findIdByEmail(target);
    if (existingId) {
      await db
        .update(users)
        .set({
          ...(name ? { name } : {}),
          emailVerified: true,
          canInvite: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingId));
      userId = existingId;
      outcome = "updated";
    } else {
      const [created] = await db
        .insert(users)
        .values({
          email: target,
          // A name is cosmetic; defaulting from the address beats requiring a flag.
          name: name ?? target.split("@")[0],
          emailVerified: true,
          canInvite: true,
        })
        .returning({ id: users.id });
      userId = created.id;
      outcome = "created";
    }
  }

  await upsertCredential(userId, password);

  return { id: userId, email: target, outcome: outcome ?? "updated" };
}

/**
 * Insert a credential account that does not already exist. Invite redeem uses this so a
 * colliding email cannot reset someone else's password the way `upsertUser` would.
 */
export async function createCredentialUser(input: {
  email: string;
  password: string;
  name?: string;
  canInvite?: boolean;
}): Promise<{ id: string; email: string }> {
  const target = normalizeEmail(input.email);
  assertUsableEmail(target);
  assertUsablePassword(input.password);

  const existingId = await findIdByEmail(target);
  if (existingId) {
    throw new Error("An account with that email already exists.");
  }

  const [created] = await db
    .insert(users)
    .values({
      email: target,
      name: input.name ?? target.split("@")[0],
      emailVerified: true,
      canInvite: input.canInvite ?? false,
    })
    .returning({ id: users.id });

  await upsertCredential(created.id, input.password);
  return { id: created.id, email: target };
}

/**
 * The credential row Better Auth checks at sign-in. `accountId` is the user's own id for
 * this provider — that is what the existing seed wrote, and Better Auth treats the pair
 * (`providerId`, `accountId`) as the account's identity with the credential provider.
 */
async function upsertCredential(userId: string, password: string): Promise<void> {
  const hashed = await hashPassword(password);

  const [existing] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
    .limit(1);

  if (existing) {
    await db
      .update(accounts)
      .set({ password: hashed, accountId: userId, updatedAt: new Date() })
      .where(eq(accounts.id, existing.id));
    return;
  }

  await db.insert(accounts).values({
    userId,
    accountId: userId,
    providerId: "credential",
    password: hashed,
  });
}
