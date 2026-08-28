-- Better Auth 1.7 keys an account by (issuer, account_id) and matches credential sign-in
-- on `issuer = 'local:credential'`. Rows written before this column existed have none, so
-- every password login fails with "Invalid email or password".
--
-- Added nullable and backfilled first: the table is populated, and `ADD COLUMN ... NOT NULL`
-- with no default would refuse (or, on MySQL, silently fill every row with an empty string).
-- The synthetic `local:` values come from `createLocalAccountIssuer`/`createOAuthAccountIssuer`;
-- Google declares its real OIDC issuer instead, so its rows must match that exactly or
-- Better Auth will mint a second account row on the next link.
ALTER TABLE "accounts" ADD COLUMN "issuer" text;--> statement-breakpoint
UPDATE "accounts" SET "issuer" = 'local:credential' WHERE "provider_id" = 'credential';--> statement-breakpoint
UPDATE "accounts" SET "issuer" = 'https://accounts.google.com' WHERE "provider_id" = 'google';--> statement-breakpoint
UPDATE "accounts" SET "issuer" = 'local:oauth:' || "provider_id" WHERE "issuer" IS NULL;--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "issuer" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_issuer_account_id_uq" ON "accounts" USING btree ("issuer","account_id");
