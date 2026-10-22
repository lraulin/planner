# Read latency

Production is Vercel → Neon. A page costs **one network round trip per query that waits on
another**. Local Postgres answers in ~0 ms, so none of this shows in dev, in tests, or in
lint — the Bills page reached 47 sequential round trips before anyone measured.

## Reads go out together

```ts
// Wrong: two waits.
const accounts = await listAccounts(userId);
const payees = await listPayees(userId);

// Right: one.
const [accounts, payees] = await Promise.all([
  listAccounts(userId),
  listPayees(userId),
]);
```

- Independent reads share one `Promise.all` — inside a loader and in the page that composes
  loaders.
- Do not read children `WHERE id IN (…parents just fetched)` when `user_id` names the same
  rows. Read each level by user, together, and attach by id in memory.
- When one read needs another's answer, chain it off that promise inside the `Promise.all`
  rather than awaiting first and gating everything behind it:

  ```ts
  const plan = getWeeklyPlan(userId, weekStart);
  const [row, entries, outline] = await Promise.all([
    plan,
    plan.then((p) => (p ? listPlanEntries(userId, p.id) : [])),
    loadOutline(userId),
  ]);
  ```

- More than ~10 queries in one wave queue on the connection pool. Fold reads of the same
  table into one query before adding an eleventh.
- A loader that takes what the caller already holds (`billAnchorsOf(categories, lastCharge)`)
  beats one that reads it again.

## A read composed twice is read once

Wrap it with `oncePerRequest` (`src/lib/db/requestMemo.ts`) when several loaders on one page
start from it — the account list, the pending selection, the budget structure.

- Shares only reads on the shared `db`. A `tx` executor always reads for itself.
- Shares only inside a render. Server actions, route handlers, the agent API and tests read
  every time, so a read after a write is never stale.
- Never wrap something a render writes.
- Primitive arguments only — an object built at the call site is a new key every time.
- The result is handed to every caller: read-only. Copy before sorting or pushing.

## Measure

```sh
npm run perf:routes     # terminal 1: the latency proxy, then the measurement
npm run dev:latency     # terminal 2: the dev server, connected through the proxy
```

Prints the longest chain of sequential round trips per route. Run it after changing a loader
or what a page loads. `npm run perf:routes -- finances` measures matching routes only.

- A page should sit at the floor plus one or two waves. Under the dev login bypass the floor
  is 2 (user, settings); signed in for real it is about 4 (session, user, settings).
- One query is one trip. The last line reports how many made a separate describe trip; it
  should say 0. A non-zero count means the driver is describing statements before binding
  them, which postgres.js did for every one until October 2026, doubling every chain.

## On a transaction, one at a time

A transaction is one connection, and a connection runs one statement at a time. Keep writing
`Promise.all` in functions that take a `DbExecutor`: on the shared `db` the reads go out
together, and on a `tx` the client (serialised in `src/db/pool.ts`) runs them in the order
issued. Nothing is lost, but nothing is gained either: a `Promise.all` of five on a
transaction is five trips. Do reads before the transaction when they do not need its
isolation.
