# Production Access for Agents

Three commands let an agent work against production without Lee pasting URLs or running
scripts by hand. Each matches one risk level. All of them read their secrets from Keychain
and never print them.

| Command                                             | What it touches                | Gate                   |
| --------------------------------------------------- | ------------------------------ | ---------------------- |
| `npx tsx scripts/prod.ts read "<sql>"`              | Production, read-only          | allowed                |
| `npx tsx scripts/prod.ts branch scripts/<x>.ts ...` | A throwaway copy of production | allowed                |
| `npx tsx scripts/prod.ts apply scripts/<x>.ts ...`  | Production, as the owner       | Lee approves every run |

## `read`

Runs SQL as the `planner_backup` role (the backup job's read-only login, Keychain service
`planner-production-backup-database-url`) inside a read-only transaction that is rolled
back. Output is tab-separated with a header; NULL prints as `∅`. SQL can also arrive on stdin.
The role has only SELECT grants, so a mistake here cannot change data. What it can do is put
production rows into an agent's context.

## `branch`

Creates a Neon branch of production (copy-on-write, seconds), resets the database owner's
password **on the branch only**, runs one repository script with `DATABASE_URL` pointed at
the branch, then deletes it. This is where dry runs go. Cutover scripts' dry runs are their
apply transaction rolled back, so they need a role that may write, which `read` cannot give.
Running `--apply` on a branch is also safe and shows the real after-state.

- The password reset matters: a branch's roles start with production's passwords, so without
  it the branch URL would also open production.
- Branches are named `agent-dry-run-<timestamp>`. A run that dies before cleaning up leaves
  one behind; the next `branch` run deletes any agent branch older than an hour.
- It uses the Neon API key the backup job already stores (Keychain service
  `planner-production-backup-neon-api`).

## `apply`

Takes a named Neon snapshot of production (`pre-apply-<timestamp>`, kept 30 days), then runs
one repository script as the owner. Restore from that snapshot in the Neon console if the run
goes wrong; the seven-day history window is a second layer.

Store the owner URL once. Copy it from the Neon console, then:

```sh
pbpaste | npx tsx scripts/prod.ts setup
printf '' | pbcopy
```

Setup refuses a role that cannot write `finance_accounts`, so the read-only URL cannot be
stored here by mistake.

## What the permission covers

`branch` and `apply` run only a single `scripts/*.ts` file through tsx, with an argument
array and no shell (`src/lib/backup/productionAccess.ts`). Allowing their command prefix
therefore allows repository scripts, not arbitrary commands.

`.claude/settings.json` rules, which Lee adds:

```json
"allow": [
  "Bash(npx tsx scripts/prod.ts read *)",
  "Bash(npx tsx scripts/prod.ts branch scripts/*)"
],
"ask": [
  "Bash(npx tsx scripts/prod.ts apply scripts/*)"
]
```
