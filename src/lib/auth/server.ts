import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";

/**
 * One Google grant serves Calendar and Contacts. Calendar needs read/write on events plus
 * the calendar list to populate its picker; Contacts is deliberately inbound-only, so the
 * least-privileged People scope is enough.
 */
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/contacts.readonly",
];

/**
 * Google is configured only when both halves of the credential are present, so a checkout
 * without them boots normally with the Connect button reporting itself unavailable —
 * rather than Better Auth throwing at import time.
 */
const googleProvider =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          scope: GOOGLE_SCOPES,
          /**
           * Both of these are load-bearing. Without `accessType: "offline"` Google returns
           * no refresh token at all, and sync dies silently about an hour after linking —
           * the failure looks like "it worked yesterday" rather than like a config error.
           * `prompt: "consent"` forces the refresh token to be re-issued on a re-link,
           * which Google otherwise only sends on the *first* consent for an account.
           */
          accessType: "offline" as const,
          prompt: "consent" as const,
        },
      }
    : undefined;

export const googleConfigured = Boolean(googleProvider);

/**
 * Self-run Better Auth. Tables live in our schema (see `users`, `sessions`, `accounts`,
 * `verifications`). Public sign-up on this handler stays disabled — accounts are created
 * by `npm run user:create` or by redeeming an invite (`src/lib/auth/invites.ts`), never
 * by `POST /api/auth/sign-up/email`.
 *
 * Google is here for **linking Calendar and Contacts to an existing account**, not for
 * signing in.
 * `disableSignUp` stays on, so connecting Google grants calendar access without opening
 * a second way to create accounts.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 16,
  },
  ...(googleProvider ? { socialProviders: googleProvider } : {}),
  user: {
    modelName: "user",
  },
  session: {
    modelName: "session",
  },
  account: {
    modelName: "account",
    /**
     * Link Google onto the existing account instead of minting a second user.
     * `disableSignUp` would block that second user anyway, so without this the connect
     * flow simply fails.
     *
     * `allowDifferentEmails` is required, not optional tidying: the owner account is
     * provisioned from `AUTH_SEED_EMAIL` (locally `dev@example.com`), which will never
     * match a real Google address. Without it, linking dies with `email_doesn't_match`.
     *
     * Safe here because linking is only ever reached from `linkSocial` by an
     * already-authenticated user deliberately connecting a Google account. Invite-created
     * accounts can link their own Google the same way. This would be the wrong setting
     * if Google were a sign-up path; it is not.
     */
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
      allowDifferentEmails: true,
    },
  },
  verification: {
    modelName: "verification",
  },
  advanced: {
    database: {
      // Match existing uuid PKs on users and use UUIDs for auth satellite tables.
      generateId: "uuid",
    },
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
