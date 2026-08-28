import { and, eq, type SQL } from "drizzle-orm";
import { accounts } from "@/db/schema";

/**
 * The issuer Better Auth stamps on a credential (email + password) account.
 *
 * Better Auth 1.7 keys every account by `(issuer, accountId)` so an OAuth provider's
 * subject cannot collide with an internal one. Providers with no issuer of their own get a
 * synthetic `local:<providerId>` from `createLocalAccountIssuer`, which lives in
 * `@better-auth/core/db` and is not re-exported by `better-auth` — reaching for it would
 * make their internal package split a direct dependency of ours.
 *
 * So the value is written out here, and then *checked* rather than trusted:
 * `signin.integration.test.ts` signs in through Better Auth for real, so a string that
 * stops matching theirs fails there instead of in production.
 */
export const CREDENTIAL_ISSUER = "local:credential";

/**
 * Google's issuer, which it declares itself rather than taking a synthetic one — so a
 * Google row's key is `("https://accounts.google.com", <the Google subject>)`.
 *
 * Better Auth writes this itself when a user connects Google; it is named here so a
 * fixture standing in for that row is the row Better Auth would have written, not merely
 * one that satisfies the NOT NULL.
 */
export const GOOGLE_ISSUER = "https://accounts.google.com";

/**
 * This user's credential row, matched on all four columns Better Auth's own
 * `findCredentialAccount` matches on.
 *
 * Sign-in skips a credential row whose issuer is not `CREDENTIAL_ISSUER`, so a narrower
 * lookup can return a row that nobody can actually log in with — which is exactly how the
 * missing-issuer bug stayed invisible to everything except the login form.
 */
export function credentialAccountFor(userId: string): SQL | undefined {
  return and(
    eq(accounts.userId, userId),
    eq(accounts.providerId, "credential"),
    eq(accounts.issuer, CREDENTIAL_ISSUER),
    eq(accounts.accountId, userId),
  );
}
