/**
 * Read-only replay of Sep 10–13 Capital One deliveries through the new pairing planner.
 *
 * Reconstructs the scrape set from bank-snapshot audit changes (the rows the old watermark
 * later deleted are not in the register), pairs them against history-feed rows that existed
 * at each sync, and prints what `planFeedHandover` would retire. Writes nothing.
 *
 *   npx tsx scripts/ingest-identity-replay.ts
 *
 * Connects as `planner_backup` via Keychain. The role is transaction-read-only; this script
 * also opens an explicit READ ONLY transaction.
 */

import { and, eq, gte, inArray, isNull, lte, notInArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  financeAccounts,
  financeAuditChanges,
  financeAuditEvents,
  financeTransactions,
  users,
} from "../src/db/schema";
import { readBackupSecrets } from "../src/lib/backup/macos";
import { redactSecrets } from "../src/lib/backup/redaction";
import { parseBankBrowserSnapshot } from "../src/lib/finances/bankSnapshot";
import {
  planFeedHandover,
  type ReplacementRow,
  type RetiringRow,
} from "../src/lib/finances/feedHandover";
import { DATE_TOLERANCE_DAYS } from "../src/lib/finances/liveFeedMatch";
import { centsToNumericString, numericStringToCents } from "../src/lib/finances/money";
import { shiftDateKey } from "../src/lib/schedule/geometry";

const WINDOW_START = new Date("2026-09-10T00:00:00Z");
const WINDOW_END = new Date("2026-09-14T00:00:00Z");
const SNAPSHOT_START = new Date("2026-09-01T00:00:00Z");
const POSTED_KEEP_FROM = "2026-09-01";
const POSTED_KEEP_TO = "2026-09-07";

type Json = Record<string, unknown>;

type TrackedScrape = {
  id: string;
  transactionDate: string;
  postedDate: string | null;
  amountCents: number;
  pending: boolean;
  externalId: string | null;
  budgetCategoryId: string | null;
  isParent: boolean;
  description: string;
};

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function jsonObject(value: unknown): Json {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : {};
}

function isScrapeSource(value: unknown): boolean {
  return typeof value === "string" && value.startsWith("scrape:");
}

function money(cents: number): string {
  return centsToNumericString(cents);
}

function dayOf(row: { transactionDate: string; postedDate: string | null }): string {
  return row.postedDate ?? row.transactionDate;
}

function rowLabel(row: {
  description: string;
  amountCents: number;
  transactionDate: string;
  postedDate: string | null;
  pending?: boolean;
}): string {
  const pending = row.pending ? " pending" : "";
  const posted =
    row.postedDate && row.postedDate !== row.transactionDate
      ? ` posted ${row.postedDate}`
      : "";
  return `${row.transactionDate}${posted}${pending}  ${money(row.amountCents)}  ${row.description || "(no description)"}`;
}

function fromSnapshotFields(id: string, fields: Json): TrackedScrape | null {
  const transactionDate = asString(fields.transactionDate);
  const amountCents = asNumber(fields.amountCents);
  if (transactionDate === null || amountCents === null) return null;
  return {
    id,
    transactionDate,
    postedDate: asString(fields.postedDate),
    amountCents,
    pending: asBoolean(fields.pending) === true,
    externalId: asString(fields.externalId),
    budgetCategoryId: asString(fields.budgetCategoryId),
    isParent: asBoolean(fields.isParent) === true,
    description: "",
  };
}

async function main(): Promise<number> {
  const { databaseUrl } = await readBackupSecrets();
  const client = postgres(databaseUrl, { max: 1, ssl: "require", prepare: false });
  const db = drizzle(client);
  const secrets = [databaseUrl];

  try {
    await client`SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`;
    await client`BEGIN READ ONLY`;

    const accounts = await db
      .select({
        id: financeAccounts.id,
        userId: financeAccounts.userId,
        name: financeAccounts.name,
        externalKey: financeAccounts.externalKey,
        email: users.email,
      })
      .from(financeAccounts)
      .innerJoin(users, eq(users.id, financeAccounts.userId))
      .where(
        sql`${financeAccounts.externalKey} = '3448' or ${financeAccounts.name} ilike '%capital one%'`,
      );
    const account = accounts.find((row) => row.externalKey === "3448") ?? accounts[0];
    if (!account) {
      console.error("No Capital One card account found.");
      return 1;
    }
    console.log(
      `Account: ${account.name}  last4=${account.externalKey}  user=${account.email}`,
    );

    const events = await db
      .select({
        id: financeAuditEvents.id,
        kind: financeAuditEvents.kind,
        origin: financeAuditEvents.origin,
        occurredAt: financeAuditEvents.occurredAt,
        summary: financeAuditEvents.summary,
        scope: financeAuditEvents.scope,
        warnings: financeAuditEvents.warnings,
        sourceEvidence: financeAuditEvents.sourceEvidence,
      })
      .from(financeAuditEvents)
      .where(
        and(
          eq(financeAuditEvents.userId, account.userId),
          gte(financeAuditEvents.occurredAt, SNAPSHOT_START),
          lte(financeAuditEvents.occurredAt, WINDOW_END),
          inArray(financeAuditEvents.kind, [
            "bank_snapshot",
            "simplefin_sync",
            "finance_import",
          ]),
        ),
      )
      .orderBy(financeAuditEvents.occurredAt);

    const scoped = events.filter((event) => {
      const scope = jsonObject(event.scope);
      const ids = Array.isArray(scope.accountIds)
        ? scope.accountIds.filter((id): id is string => typeof id === "string")
        : [];
      const names = Array.isArray(scope.accountNames)
        ? scope.accountNames.filter((name): name is string => typeof name === "string")
        : [];
      return (
        ids.includes(account.id) ||
        names.some((name) => name.toLowerCase().includes("capital")) ||
        event.origin.toLowerCase().includes("capital")
      );
    });

    const eventIds = scoped.map((event) => event.id);
    const changes =
      eventIds.length === 0
        ? []
        : await db
            .select({
              eventId: financeAuditChanges.eventId,
              entityType: financeAuditChanges.entityType,
              entityIdentity: financeAuditChanges.entityIdentity,
              beforeFields: financeAuditChanges.beforeFields,
              afterFields: financeAuditChanges.afterFields,
            })
            .from(financeAuditChanges)
            .where(
              and(
                eq(financeAuditChanges.userId, account.userId),
                inArray(financeAuditChanges.eventId, eventIds),
              ),
            );

    const changesByEvent = new Map<string, typeof changes>();
    for (const change of changes) {
      const list = changesByEvent.get(change.eventId) ?? [];
      list.push(change);
      changesByEvent.set(change.eventId, list);
    }

    const descriptionByExternalId = new Map<string, string>();
    for (const event of scoped) {
      if (event.kind !== "bank_snapshot") continue;
      const rawText = asString(jsonObject(event.sourceEvidence).rawText);
      if (!rawText) continue;
      const parsed = parseBankBrowserSnapshot(rawText);
      if (!parsed.ok) continue;
      for (const row of [...parsed.snapshot.posted, ...parsed.snapshot.pending]) {
        descriptionByExternalId.set(row.externalId, row.description);
      }
    }

    function enrich(row: TrackedScrape): TrackedScrape {
      if (row.description !== "" || row.externalId === null) return row;
      return {
        ...row,
        description: descriptionByExternalId.get(row.externalId) ?? "",
      };
    }

    function scrapeAt(at: Date): TrackedScrape[] {
      const state = new Map<string, TrackedScrape>();
      for (const event of scoped) {
        if (event.occurredAt > at) break;
        if (event.kind !== "bank_snapshot") continue;
        for (const change of changesByEvent.get(event.id) ?? []) {
          if (change.entityType !== "transaction") continue;
          const after = change.afterFields ? jsonObject(change.afterFields) : null;
          const before = change.beforeFields ? jsonObject(change.beforeFields) : null;
          if (
            after &&
            isScrapeSource(after.externalSource) &&
            after.accountId === account.id
          ) {
            const row = fromSnapshotFields(change.entityIdentity, after);
            if (row) state.set(row.id, enrich(row));
            continue;
          }
          if (
            after === null &&
            (isScrapeSource(before?.externalSource) || state.has(change.entityIdentity))
          ) {
            state.delete(change.entityIdentity);
          }
        }
      }
      return [...state.values()];
    }

    async function feedAt(
      at: Date,
      scrape: readonly TrackedScrape[],
    ): Promise<ReplacementRow[]> {
      if (scrape.length === 0) return [];
      const dates = scrape.flatMap((row) => [
        row.transactionDate,
        ...(row.postedDate ? [row.postedDate] : []),
      ]);
      const from = shiftDateKey(
        dates.reduce((min, key) => (key < min ? key : min)),
        -DATE_TOLERANCE_DAYS,
      );
      const to = shiftDateKey(
        dates.reduce((max, key) => (key > max ? key : max)),
        DATE_TOLERANCE_DAYS,
      );
      const rows = await db
        .select({
          id: financeTransactions.id,
          transactionDate: financeTransactions.transactionDate,
          postedDate: financeTransactions.postedDate,
          description: financeTransactions.description,
          amount: financeTransactions.amount,
          isParent: financeTransactions.isParent,
          budgetCategoryId: financeTransactions.budgetCategoryId,
          notes: financeTransactions.notes,
          flowOverride: financeTransactions.flowOverride,
        })
        .from(financeTransactions)
        .where(
          and(
            eq(financeTransactions.userId, account.userId),
            eq(financeTransactions.accountId, account.id),
            isNull(financeTransactions.parentId),
            sql`${financeTransactions.externalSource} is not null`,
            notInArray(financeTransactions.externalSource, [
              "scrape:capitalone",
              "scrape:chase",
            ]),
            lte(financeTransactions.createdAt, at),
            sql`(
              (${financeTransactions.transactionDate} >= ${from}
                and ${financeTransactions.transactionDate} <= ${to})
              or (${financeTransactions.postedDate} >= ${from}
                and ${financeTransactions.postedDate} <= ${to})
            )`,
          ),
        );
      return rows.map((row) => ({
        id: row.id,
        transactionDate: row.transactionDate,
        postedDate: row.postedDate,
        description: row.description,
        amountCents: numericStringToCents(row.amount) ?? 0,
        isParent: row.isParent,
        budgetCategoryId: row.budgetCategoryId,
        notes: row.notes,
        flowOverride: row.flowOverride,
      }));
    }

    console.log("\nEvents in scope:");
    for (const event of scoped.filter(
      (item) => item.occurredAt >= WINDOW_START && item.occurredAt < WINDOW_END,
    )) {
      console.log(
        `  ${event.occurredAt.toISOString()}  ${event.kind.padEnd(16)}  ${event.summary}`,
      );
    }

    const syncs = scoped.filter(
      (event) =>
        event.kind === "simplefin_sync" &&
        event.occurredAt >= WINDOW_START &&
        event.occurredAt < WINDOW_END &&
        event.summary.startsWith("SimpleFIN rows:"),
    );

    const verdicts: { name: string; pass: boolean; detail: string }[] = [];

    for (const sync of syncs) {
      // Scrape set as the last snapshot left it, before this sync's watermark deletes.
      const justBefore = new Date(sync.occurredAt.getTime() - 1);
      const scrape = scrapeAt(justBefore);
      const feed = await feedAt(sync.occurredAt, scrape);
      const retiring: RetiringRow[] = scrape.map((row) => ({
        id: row.id,
        transactionDate: row.transactionDate,
        postedDate: row.postedDate,
        amountCents: row.amountCents,
        description: row.description,
        isParent: row.isParent,
        budgetCategoryId: row.budgetCategoryId,
        notes: "",
        flowOverride: null,
      }));
      const plan = planFeedHandover(retiring, feed);
      const retired = new Set(plan.steps.map((step) => step.retiredId));
      const scrapeById = new Map(scrape.map((row) => [row.id, row]));
      const feedById = new Map(feed.map((row) => [row.id, row]));

      const historicalDeletes = (changesByEvent.get(sync.id) ?? []).filter((change) => {
        if (change.entityType !== "transaction" || change.afterFields !== null)
          return false;
        const before = change.beforeFields ? jsonObject(change.beforeFields) : null;
        return isScrapeSource(before?.externalSource);
      });

      const postedKeepWouldRetire = scrape.filter(
        (row) =>
          !row.pending &&
          dayOf(row) >= POSTED_KEEP_FROM &&
          dayOf(row) <= POSTED_KEEP_TO &&
          retired.has(row.id),
      );
      const chatgpt = scrape.filter((row) => /chatgpt/i.test(row.description));
      const claude = feed.filter((row) => /claude|anthropic/i.test(row.description));
      const chatgptPairedWithClaude = plan.steps.filter((step) => {
        const browser = scrapeById.get(step.retiredId);
        const replacement = feedById.get(step.replacementId);
        if (!browser || !replacement) return false;
        return (
          /chatgpt/i.test(browser.description) &&
          /claude|anthropic/i.test(replacement.description)
        );
      });
      const pendingWouldRetire = scrape.filter(
        (row) => row.pending && retired.has(row.id),
      );

      console.log(`\n=== ${sync.occurredAt.toISOString()}  ${sync.summary}`);
      console.log(
        `  reconstructed scrape ${scrape.length}  feed ${feed.length}  new plan retires ${plan.steps.length}  old audit deleted ${historicalDeletes.length}`,
      );
      if (postedKeepWouldRetire.length > 0) {
        console.log("  NEW PLAN WOULD RETIRE posted Sep 1–7:");
        for (const row of postedKeepWouldRetire) console.log(`    ${rowLabel(row)}`);
      } else {
        console.log("  posted Sep 1–7 scrape rows kept (none in the new plan).");
      }
      if (chatgpt.length > 0 || claude.length > 0) {
        console.log("  ChatGPT scrape:");
        for (const row of chatgpt) console.log(`    ${rowLabel(row)}`);
        console.log("  Claude/Anthropic feed:");
        for (const row of claude) console.log(`    ${rowLabel(row)}`);
        const chatgptOwn = plan.steps.filter((step) => {
          const browser = scrapeById.get(step.retiredId);
          const replacement = feedById.get(step.replacementId);
          return (
            !!browser &&
            !!replacement &&
            /chatgpt/i.test(browser.description) &&
            /chatgpt|openai/i.test(replacement.description)
          );
        });
        console.log(
          chatgptPairedWithClaude.length === 0
            ? "  ChatGPT/Claude: no pair."
            : "  ChatGPT/Claude WOULD PAIR:",
        );
        for (const step of chatgptPairedWithClaude) {
          const browser = scrapeById.get(step.retiredId);
          const replacement = feedById.get(step.replacementId);
          if (browser && replacement) {
            console.log(`    ${rowLabel(browser)}  ->  ${rowLabel(replacement)}`);
          }
        }
        for (const step of chatgptOwn) {
          const browser = scrapeById.get(step.retiredId);
          const replacement = feedById.get(step.replacementId);
          if (browser && replacement) {
            console.log(
              `  ChatGPT paired with its own feed row: ${rowLabel(replacement)}`,
            );
          }
        }
        if (plan.steps.length > 0) {
          console.log("  new plan pairs:");
          for (const step of plan.steps) {
            const browser = scrapeById.get(step.retiredId);
            const replacement = feedById.get(step.replacementId);
            if (browser && replacement) {
              console.log(`    ${rowLabel(browser)}  ->  ${rowLabel(replacement)}`);
            }
          }
        }
      }
      if (pendingWouldRetire.length > 0) {
        console.log("  NEW PLAN WOULD RETIRE pending holds:");
        for (const row of pendingWouldRetire) console.log(`    ${rowLabel(row)}`);
      } else {
        console.log("  pending holds kept (none in the new plan).");
      }

      const isSep10 = sync.occurredAt.toISOString().startsWith("2026-09-10");
      if (isSep10) {
        verdicts.push({
          name: "Sep 10: posted Sep 1–7 stay",
          pass: postedKeepWouldRetire.length === 0,
          detail:
            postedKeepWouldRetire.length === 0
              ? `old audit deleted ${historicalDeletes.length} scrape rows; new plan retires ${plan.steps.length}, none dated Sep 1–7`
              : `${postedKeepWouldRetire.length} posted Sep 1–7 rows would still retire`,
        });
        verdicts.push({
          name: "ChatGPT/Claude do not pair",
          pass: chatgptPairedWithClaude.length === 0,
          detail:
            chatgptPairedWithClaude.length === 0
              ? `ChatGPT scrape ${chatgpt.length}, Claude feed ${claude.length}, pairs 0`
              : `${chatgptPairedWithClaude.length} ChatGPT/Claude pair(s)`,
        });
      }
      if (
        sync.occurredAt.toISOString().startsWith("2026-09-11") ||
        sync.occurredAt.toISOString().startsWith("2026-09-12") ||
        sync.occurredAt.toISOString().startsWith("2026-09-13")
      ) {
        const holdNames = /vetsource|domino|starbucks|apple\.com/i;
        const namedHoldsRetired = pendingWouldRetire.filter((row) =>
          holdNames.test(row.description),
        );
        verdicts.push({
          name: `${sync.occurredAt.toISOString().slice(0, 10)}: named holds survive sync`,
          pass: namedHoldsRetired.length === 0,
          detail:
            namedHoldsRetired.length === 0
              ? "no named pending hold in the new plan"
              : namedHoldsRetired.map(rowLabel).join("; "),
        });
      }
    }

    const current = await db
      .select({
        transactionDate: financeTransactions.transactionDate,
        postedDate: financeTransactions.postedDate,
        description: financeTransactions.description,
        amount: financeTransactions.amount,
        pending: financeTransactions.pending,
        externalSource: financeTransactions.externalSource,
      })
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, account.userId),
          eq(financeTransactions.accountId, account.id),
          isNull(financeTransactions.parentId),
          sql`${financeTransactions.description} ~* 'vetsource|domino|starbucks|chatgpt|anthropic|claude|smeco|neon'`,
          sql`coalesce(${financeTransactions.postedDate}, ${financeTransactions.transactionDate}) >= '2026-09-01'`,
        ),
      );
    console.log("\nCurrent register (named merchants):");
    if (current.length === 0) console.log("  (none)");
    for (const row of current) {
      console.log(
        `  ${row.externalSource ?? "?"}  ${rowLabel({
          description: row.description,
          amountCents: Math.round(Number(row.amount) * 100),
          transactionDate: row.transactionDate,
          postedDate: row.postedDate,
          pending: row.pending,
        })}`,
      );
    }

    console.log("\nVerdicts:");
    let failed = 0;
    for (const verdict of verdicts) {
      console.log(
        `  ${verdict.pass ? "PASS" : "FAIL"}  ${verdict.name} — ${verdict.detail}`,
      );
      if (!verdict.pass) failed += 1;
    }
    if (verdicts.length === 0) {
      console.log("  FAIL  no simplefin_sync events in the window");
      failed += 1;
    }

    await client`ROLLBACK`;
    return failed === 0 ? 0 : 1;
  } catch (error) {
    const message =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    console.error(redactSecrets(message, secrets));
    return 1;
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
