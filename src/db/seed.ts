import { devUserEmail } from "@/lib/auth/identity";
import { upsertUser } from "@/lib/auth/provision";
import { describeDatabaseUrl } from "@/lib/db/target";
import { seedSampleData } from "./sample-data";

/**
 * `npm run db:seed` — bring a **local** database up to a usable state.
 *
 * This is the test-account bootstrap, not a general provisioning tool. It creates (or
 * resets the password of) the dev-bypass account from `@/lib/auth/identity` and loads the
 * demo outline. Real accounts — the owner, a second person — are `npm run user:create`,
 * which does not wipe anything.
 *
 * It **refuses to run in production**. Seeding is destructive for the user it targets, and
 * the one legitimate remote use it used to have (rotate the owner's password without
 * touching data, via `SEED_SAMPLE_DATA=0`) is now `user:create` with no sample-data flag —
 * a command whose name does not have to be defused with an environment variable.
 *
 * Env:
 * - AUTH_DEV_USER_EMAIL     (default test@example.com)
 * - AUTH_DEV_USER_PASSWORD  (default "password123" — local only)
 * - AUTH_DEV_USER_NAME      (default "Test User")
 * - SEED_SAMPLE_DATA=0      credentials only, no sample outline
 */

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "db:seed is a local test bootstrap and is destructive. To provision or rotate a real account, use: npm run user:create -- --email <address> --password <secret>",
    );
  }

  console.log(`Database: ${describeDatabaseUrl(process.env.DATABASE_URL)}`);

  const email = devUserEmail();
  const user = await upsertUser({
    email,
    password: process.env.AUTH_DEV_USER_PASSWORD?.trim() || "password123",
    name: process.env.AUTH_DEV_USER_NAME?.trim() || "Test User",
  });

  console.log(`Dev user ${user.outcome}: ${user.email} (${user.id})`);

  if (process.env.SEED_SAMPLE_DATA === "0") {
    console.log("SEED_SAMPLE_DATA=0 — skipped sample outline/schedule data.");
    return;
  }

  await seedSampleData(user.id);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
