import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";

/**
 * Self-run Better Auth. Tables live in our schema (see `users`, `sessions`, `accounts`,
 * `verifications`). Sign-up is disabled — the owner account is provisioned by seed/env.
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
    minPasswordLength: 8,
  },
  user: {
    modelName: "user",
  },
  session: {
    modelName: "session",
  },
  account: {
    modelName: "account",
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
