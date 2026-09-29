import { and, eq, type SQL } from "drizzle-orm";
import { accounts } from "@/db/schema";

/**
 * The issuer Better Auth 1.7.0–1.7.2 stamps on a credential (email + password) account.
 *
 * Those versions keyed every account by `(issuer, accountId)` and skipped a credential row
 * whose issuer was not this value at sign-in. 1.7.3 went back to the 1.6 key
 * `(providerId, accountId)` and no longer reads or writes the column. Provisioning keeps
 * writing it so a row stays visible to sign-in on either side of that change; nothing
 * matches on it any more.
 *
 * The synthetic value comes from `createLocalAccountIssuer` in `@better-auth/core/db`,
 * which `better-auth` does not re-export — reaching for it would make their internal
 * package split a direct dependency of ours. While a 1.7.0–1.7.2 release is installed,
 * `signin.integration.test.ts` signs in through Better Auth for real, so a string that
 * stops matching theirs fails there.
 */
export const CREDENTIAL_ISSUER = "local:credential";

/**
 * This user's credential row, matched on the key Better Auth's own
 * `findCredentialAccount` uses: `providerId = "credential"` and `accountId` = the user's id.
 *
 * `userId` is matched as well, although for credentials `accountId` already is the user's
 * id: it keeps the predicate scoped to the caller even if a row were ever written with a
 * different subject. `issuer` is deliberately not matched — Better Auth 1.7.3 and later
 * leave it null on rows they write, so matching it would hide a row sign-in can see.
 */
export function credentialAccountFor(userId: string): SQL | undefined {
  return and(
    eq(accounts.userId, userId),
    eq(accounts.providerId, "credential"),
    eq(accounts.accountId, userId),
  );
}
