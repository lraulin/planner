---
name: run-planner
description: Build, run, screenshot and drive the planner Next.js app — start the dev server and Postgres, click through the outline/schedule UI in a real browser, verify a change works end to end, run tests, typecheck, lint and the production build. Use for "run planner", "screenshot the outline", "check this works in the app", "start the dev server".
---

# Running and driving planner

Next.js 16 (App Router) + Postgres via Drizzle, served on **port 3047**. Data lives in a
local Docker Postgres; there is no auth, so every page renders as the hardcoded dev user.

The agent path is **`.agents/skills/run-planner/driver.mjs`** — a zero-dependency Chrome
DevTools Protocol driver. It launches the Chrome already installed on the machine, runs a
list of steps, writes screenshots, and exits. Nothing is added to `package.json`.

All paths below are relative to the repo root.

## Prerequisites

Already satisfied on this machine; needed on a clean one:

- Node 26 (the driver uses the built-in `WebSocket` and `fetch` — no polyfills)
- Docker Desktop running
- Google Chrome at `/Applications/Google Chrome.app`. Override with
  `PLANNER_CHROME=/path/to/chrome`.

## Setup

```sh
npm install
cp .env.example .env.local     # DATABASE_URL is already correct for the Docker Postgres
npm run db:up                  # starts container planner-postgres
npm run db:migrate             # idempotent; safe to re-run
npm run db:seed                # DESTRUCTIVE — see Gotchas
```

## Run: dev server

```sh
npm run dev                    # http://localhost:3047
```

Leave it running in another shell (or the background); the driver does not start it and
exits with instructions if 3047 is not answering.

## Run: the driver (agent path)

Steps come from stdin (one per line, `#` comments allowed) or from argv:

```sh
node .agents/skills/run-planner/driver.mjs <<'EOF'
goto /outline
shot outline
rightclick text=ACME Account
shot row-menu
EOF

node .agents/skills/run-planner/driver.mjs 'goto /schedule' 'shot week'
```

Screenshots land in **`.artifacts/planner-shots/`** (gitignored). Read them — a driver
step passing only means the click landed, not that the page looks right.

`node .agents/skills/run-planner/driver.mjs help` prints the command list:

| Step                                             | Notes                                                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `goto <path>`                                    | joined to `$PLANNER_URL` (default `http://localhost:3047`)                                                                           |
| `shot <name>`                                    | PNG into `.artifacts/planner-shots/`                                                                                                 |
| `viewport <w>x<h>`                               | resize; **below 768 wide also turns on touch emulation**. `390x844` is the iPhone 12. Also settable up front via `PLANNER_VIEWPORT`. |
| `scheme light\|dark`                             | emulate `prefers-color-scheme`                                                                                                       |
| `click` / `dblclick` / `rightclick <sel>`        | real mouse events; `dblclick` a grid row opens its detail drawer                                                                     |
| `drag <src> \| <dst> [\| before\|inside\|after]` | HTML5 drag — **outline row reorder**                                                                                                 |
| `pdrag <src> \| <dst>`                           | pointer drag — **schedule rail → calendar**                                                                                          |
| `swipe <sel> \| <dx> [\| hold]`                  | horizontal row swipe, signed px (-120 left, 120 right); `hold` keeps the button down so `shot` catches the open rail                 |
| `tswipe <sel> \| <dx> [\| hold]`                 | the same with **real touch events** — the only way `touch-action` is exercised                                                       |
| `release`                                        | let go of a held swipe, either kind                                                                                                  |
| `fill <sel> \| <value>`                          | triple-click, then insert                                                                                                            |
| `select <sel> \| <value>`                        | `<option>` by value or visible text                                                                                                  |
| `type <text>` / `key <Name>`                     | `Enter Tab Escape Delete Insert F2 Arrow* Home End`, e.g. `key Shift+Tab`                                                            |
| `wait <sel> [\| ms]`                             | poll, default 8000ms                                                                                                                 |
| `text <css>` / `count <css>` / `eval <js>`       | read page state back                                                                                                                 |
| `dialogs accept\|dismiss`                        | how `window.confirm()` is answered (default accept)                                                                                  |
| `console`                                        | dump collected console output + dialogs                                                                                              |

Selectors:

- `text=Save` — deepest **visible** match; exact text beats substring
- `label=Priority` — the form control with that label (the only stable handle in drawers)
- `.fc-timegrid-body >> text=Someday/Maybe` — CSS scope `>>` inner selector, for labels
  that appear in more than one place
- anything else is CSS

Flags: `--headed` opens a visible window, `--keep-open` leaves Chrome running to poke at
by hand.

### Flows verified with this driver

Edit a record and confirm it persisted (drawer → save → reload):

```sh
node .agents/skills/run-planner/driver.mjs <<'EOF'
goto /outline
dblclick text=Steve's retirement party
wait label=Priority
fill label=Priority | B2
select label=State | In progress
click text=Save
sleep 1500
goto /outline
eval [...document.querySelectorAll('[role="row"]')].filter(r=>r.textContent.includes('retirement')).map(r=>r.querySelector('select')?.value)
EOF
```

Reorder a row, and read the order back:

```sh
node .agents/skills/run-planner/driver.mjs <<'EOF'
goto /outline
drag text=Steve's retirement party | text=Some are complex multi-step projects | before
eval [...document.querySelectorAll('[role="row"]')].map(r=>r.getAttribute('aria-label'))
EOF
```

Schedule a project block, then delete it:

```sh
node .agents/skills/run-planner/driver.mjs <<'EOF'
goto /schedule
count .fc-event
pdrag text=Someday/Maybe | css=.fc-timegrid-col[data-date$="-29"]
count .fc-event
click .fc-timegrid-body >> text=Someday/Maybe
click text=Delete
sleep 1500
count .fc-event
EOF
```

Keyboard-driven outline (this app is keyboard-first — see the hint bar at the bottom):

```sh
node .agents/skills/run-planner/driver.mjs <<'EOF'
goto /outline
click text=ACME Account
key ArrowDown
key F2
eval document.activeElement.value
key Escape
EOF
```

Routes: 26 pages — 23 with no dynamic segment, which `npm run smoke` walks and prints, plus
`/fitness/exercises/[exerciseId]`, `/fitness/sessions/[sessionId]` and
`/schedule/time-chart/[chartId]`, which need a real id. Run `npm run smoke` for the current
list rather than trusting one written down here.

## Direct invocation — internal code, no browser

Server code is reachable from a script, but it must be **`.mts`**: `package.json` has no
`"type": "module"`, so `tsx` compiles a `.ts` file as CJS and rejects top-level `await`.
The `@/` alias resolves.

```sh
cat > probe.mts <<'TS'
import { loadOutline } from "@/lib/tree/queries";
import { getCurrentUserId } from "@/lib/auth";
const nodes = await loadOutline(await getCurrentUserId());
console.log(nodes.length, nodes.slice(0, 3).map((n) => `${n.type}:${n.name}`));
process.exit(0);
TS
npx tsx --env-file=.env.local probe.mts   # → 31 [ 'result_area:Work […]', … ]
rm probe.mts
```

Pure logic (`src/lib/tree/*`, `src/lib/schedule/*`) has no DB dependency — for those,
`npx vitest run src/lib/tree/dnd.test.ts` is faster than any of the above.

## Test / typecheck / lint / build

```sh
npm test          # vitest — 143 files, 2056 tests; needs Postgres up or 22 files skip
npm run test:unit # 121 files, 1583 tests; no database
npm run typecheck # tsc --noEmit — clean
npm run lint      # eslint --max-warnings=0 — clean, and that is the bar
npm run build     # passes; do not run it while `npm run dev` is up (see Gotchas)
npm run smoke     # loads all 23 static routes; needs the dev server (see below)
```

## Gotchas

- **`npm run build` and `npm run dev` fight over `.next`.** Running a build while the dev
  server is up corrupts the running server's output. Stop dev first, or build in a
  throwaway worktree.
- **A worktree needs a _copied_ `node_modules`, not a symlink.** Turbopack panics with
  `Symlink [project]/node_modules is invalid, it points out of the filesystem root`. On
  APFS `cp -Rc` clones it in ~4s:
  ```sh
  git worktree add --detach /tmp/planner-build HEAD
  cp -Rc node_modules /tmp/planner-build/node_modules
  cp .env.local /tmp/planner-build/.env.local
  (cd /tmp/planner-build && npm run build && npx next start -p 3057)
  PLANNER_URL=http://localhost:3057 node .agents/skills/run-planner/driver.mjs 'goto /outline' 'shot prod'
  ```
- **The outline uses HTML5 drag-and-drop, not pointer drags.** Synthesized mouse events
  cannot start it; the driver's `drag` uses `Input.setInterceptDrags` and replays the
  intercepted payload as `dragEnter`/`dragOver`/`drop`. FullCalendar's rail is the
  opposite — it tracks the pointer, so use `pdrag` there. Using the wrong one silently
  does nothing (`drag` at least errors with "no drag started").
- **Drop position decides the outcome.** `DataGrid` reads which third of the target row
  the pointer is in: top third = `before`, bottom third = `after`, middle = `inside`,
  which **reparents** rather than reorders. `drag` defaults to `after`; pass the zone
  explicitly when it matters.
- **Rows only become draggable on mousedown** (so text selection inside row inputs still
  works). The driver pauses 150ms after pressing to let React re-render; a faster
  press-then-move starts no drag at all.
- **Touch emulation kills HTML5 drag, and turning it back off does not revive it.** Calling
  `Emulation.setTouchEmulationEnabled` after the page has loaded — even with
  `enabled: false` — leaves `drag` failing with "no drag started". `applyViewport` therefore
  only toggles it when the value actually changes. If you add a step that touches the
  Emulation domain, re-check `drag` at 1280x800 afterwards; this failed silently once and
  looked like a regression in the grid.
- **To look at a rail, swipe 60px, not 100px.** Anything past 72px arms, and releasing an
  armed swipe **fires the action for real** — completions and deletions land in the dev
  database. 60px shows the rail at full colour with the content still ramping and commits to
  nothing. Several rows were completed the hard way before this was written down.
- **`swipe` is a mouse; `tswipe` is a finger.** `Input.dispatchMouseEvent` produces pointer
  events of type `mouse` even under touch emulation, so it never consults `touch-action` —
  the browser's own call on whether a gesture belongs to the page or the scroller, which is
  the arbitration a swipe lives or dies by. Check a new gesture with `tswipe` at least once.
- **A swipe needs the row on screen and needs its intermediate moves.** `swipe` presses,
  steps across in 12 moves, and releases — the row locks its axis at 12px and arms at 72px,
  so a single jump to the end would skip every state worth looking at. `find` returns
  coordinates for rows below the fold too, and the synthesized mouse events then land on
  whatever _is_ at those coordinates, so the gesture silently does nothing; scroll the row
  into view first. And remember a released swipe past 72px **fires the action** — several
  rows got completed for real while checking that six grids had rails.
- **`swipe … | hold` is how you see the rail at all.** Release springs the row home in
  180ms, long before a screenshot lands.
- **Below 768px wide the grids render as compact card rows, not a column grid.** `role="row"`
  still works, but there are no `role="gridcell"` children and no column header, so a
  selector written against the desktop layout finds nothing at `390x844`. Tap (`click`)
  opens the drawer there; `dblclick` is the desktop trigger.
- **`window.confirm()` freezes everything.** Deleting an appointment
  (`AppointmentDrawer`) or a Time Chart area (`TimeChartEditorView`) opens a native
  dialog; while it is up, every CDP call times out (`CDP timeout:
Input.dispatchMouseEvent`). The driver auto-answers via
  `Page.javascriptDialogOpening` — use `dialogs dismiss` to take the cancel branch. Do
  not remove that handler.
- **Form fields have React-generated ids** (`_r_0_`, unstable across renders), and no
  `name` attributes. `label=Priority` is the way in; CSS selectors on drawer inputs will
  rot.
- **`role="row"` and `aria-label` on grid rows are this driver's only stable handles** —
  every assertion above reads them. Accessibility is not a goal in this app
  (`ux-principles.md`), so nobody is keeping them for compliance; they are kept because
  stripping them would leave no way to find a row. Same for `role="dialog"`, which
  `isModalOpen()` uses to suppress the `c` shortcut.
- **`text=` matches substrings, so `text=Save` used to hit "Unsaved changes".** Exact
  matches now win, but when a label legitimately appears twice — a project in the
  schedule rail _and_ on the calendar — the last one in document order wins. Scope it:
  `.fc-timegrid-body >> text=Someday/Maybe`.
- **The browser driver runs as the dev/test account, not a real one.** `AUTH_DEV_BYPASS`
  skips the login screen and serves requests as `AUTH_DEV_USER_EMAIL` (default
  `test@example.com`) — see `src/lib/auth/identity.ts`. That account is deliberately not
  linked to Google, because sync is bidirectional: clicking around the schedule while signed
  in as a **real** account edits a real calendar. If you need to work on Google sync, sign in
  as that account on purpose and know what you are touching.
- **`npm run db:seed` deletes the dev user's nodes, appointments and time charts** before
  inserting (`src/db/seed.ts`). Never run it to "refresh" a database someone is using.
  To exercise it safely, point it at a scratch database:
  ```sh
  docker exec planner-postgres psql -U planner -d postgres -c 'CREATE DATABASE planner_seedcheck'
  export DATABASE_URL="postgresql://planner:planner@localhost:5432/planner_seedcheck"
  npx drizzle-kit migrate && npm run db:seed
  docker exec planner-postgres psql -U planner -d postgres -c 'DROP DATABASE planner_seedcheck'
  ```
  This works because **an exported `DATABASE_URL` beats `--env-file=.env.local`** — Node
  does not let the file override an existing environment variable. Same reason a stale
  exported `DATABASE_URL` will quietly send `db:migrate` at the wrong database.
- **The gate is clean, and a husky pre-commit hook runs it** — lint, typecheck and
  `test:unit` on every commit, the full suite on every push. So a lint error is yours and it
  will block the commit; do not go looking for a pre-existing count to compare against.
- **`npm run test:unit` passing does not mean the database tests ran.** They skip when
  Postgres is down, with a warning that is easy to scroll past — `npm run db:up` first, and
  check for it after touching `mutations.ts` or `queries.ts`.
- **The suite pins `TZ` to `America/New_York`** (`vitest.config.ts`). Some tests are about
  local wall clock and only mean something in a named zone. A date test that fails is a real
  failure, not your machine.
- **`/goals` and `/wishes` are empty with the stock seed** — "No goals match this view."
  is the correct render, not a failure.
- **Static-looking pages are `force-dynamic`.** Every tab hits Postgres on each request,
  so a stopped container shows as a server error, not stale data.

## Troubleshooting

| Symptom                                                                   | Fix                                                                                                                                                              |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Dev server not reachable at http://localhost:3047`                       | `npm run db:up && npm run dev` in another shell                                                                                                                  |
| `Cannot launch Chrome at /Applications/…`                                 | set `PLANNER_CHROME` to the real binary path                                                                                                                     |
| `CDP timeout: Input.dispatchMouseEvent`                                   | a native dialog is open — the click before it triggered `window.confirm()`; the driver handles this, so suspect a hand-rolled `Runtime.evaluate` that opened one |
| `selector not found after 8000ms`                                         | the element renders but is invisible/zero-size (collapsed row, closed drawer), or the text is split across nodes — check with `eval` and `count` first           |
| `no drag started from …`                                                  | that row is not draggable (only the outline grid is), or you wanted `pdrag`                                                                                      |
| `Top-level await is currently not supported with the "cjs" output format` | rename the script `.mts`                                                                                                                                         |
| `TurbopackInternalError: Symlink [project]/node_modules is invalid`       | copy `node_modules` into the worktree instead of symlinking                                                                                                      |
| Blank/error screenshot after a mutation                                   | `console` — server action errors surface there, not in the driver's exit code                                                                                    |
