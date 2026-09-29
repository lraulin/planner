-- Better Auth 1.7.3 went back to the 1.6 account identity, (provider_id, account_id), and no
-- longer writes `issuer`. It also validates the schema at startup and refuses every auth
-- request while a NOT NULL column it never writes exists, so 0081's NOT NULL `issuer` must
-- be relaxed before better-auth can move past 1.7.2. The column stays (credential rows still
-- carry `local:credential`, which 1.7.0-1.7.2 sign-in matches on); only its constraint and
-- the index keyed on it go.
--
-- The new unique index is the key Better Auth now looks accounts up by, and it rejects a
-- lookup that matches two rows. CREATE UNIQUE INDEX fails if duplicates already exist,
-- which fails the production build's migrate step before the deploy goes live. Check first:
--   SELECT provider_id, account_id, count(*) FROM accounts GROUP BY 1, 2 HAVING count(*) > 1;
DROP INDEX "accounts_issuer_account_id_uq";--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "issuer" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_account_id_uq" ON "accounts" USING btree ("provider_id","account_id");