# Apple Reminders → Planner Inbox

Drain Apple Reminders into the planner **Inbox** from an iPhone, iPad or Mac Shortcut.
"Hey Siri, remind me to call the dentist" ends up as a task in the outline.

Uses `POST /api/agent/capture` (Bearer API key), the same endpoint as the Alfred workflow.

Spec: `agent-os/specs/2026-07-30-2126-apple-reminders-drain/`.

## Why a Shortcut and not a cron job

Apple has no server-side Reminders API. EventKit is on-device only, and iOS 13's Reminders
migration broke the old iCloud CalDAV route, so nothing running on Vercel can read your
reminders. The drain has to execute on a device that is already signed in — which means a
Shortcut, run by you.

## How it behaves

- Reads **incomplete reminders in the default list** — where Siri puts things.
- POSTs them as one batch: name, notes, due date.
- Marks each one **complete** only after the POST is confirmed.
- Every item carries an `externalId`, so **running it twice is free**. If the POST lands
  but the Shortcut dies before completing the reminders, just run it again — already-
  imported items come back as `skipped`, not duplicated.

Reminders is treated as a **queue into the planner**, not a place things live. Draining the
default list empty is the intent. Keep anything you want Reminders to actually remind you
about in a different list; the drain never looks at it.

## Prerequisites

1. Planner deployed, or running locally (`npm run dev` → `http://localhost:3047`).
2. `PLANNER_AGENT_API_KEY` set on the server (Vercel Production, not only `.env.local`).
3. The Shortcuts app. No Powerpack, no paid anything.

## Check the endpoint first

Build nothing until this works. The Shortcuts editor is a bad place to debug an HTTP
problem.

```sh
export PLANNER_BASE_URL="http://localhost:3047"     # or your Vercel origin
export PLANNER_AGENT_API_KEY="…"
# only if Deployment Protection is on — see "Production" below:
export VERCEL_AUTOMATION_BYPASS_SECRET="…"

./tools/shortcuts/drain.sh
```

Expected:

```text
first run:  created 2, skipped 0
second run: created 0, skipped 2
```

The second line is the feature. If it says `created 2` again, dedupe is broken and the
Shortcut will duplicate everything — stop and fix that first.

Clean up the two sample tasks from the Inbox afterwards.

## Build the Shortcut

Shortcuts cannot be version-controlled as text, so this is a recipe rather than a file.
Roughly ten actions.

### 1. Configuration

Start with three **Text** actions, each followed by **Set Variable**, so the secrets are in
one place at the top:

| Variable       | Value                                               |
| -------------- | --------------------------------------------------- |
| `BaseURL`      | `https://your-app.vercel.app` (no trailing slash)   |
| `ApiKey`       | the same secret as Vercel's `PLANNER_AGENT_API_KEY` |
| `BypassSecret` | only if Deployment Protection is on; otherwise skip |

### 2. Find the reminders

**Find Reminders** where:

- `List` **is** `Reminders` (the default list — this is the one knob to change if you move
  to a dedicated list)
- `Is Completed` **is** `false`

**Set Variable** → `Pending`. Step 5 needs this exact set again; re-running Find Reminders
at the end would also pick up anything added while the POST was in flight, and complete it
without importing it.

Then **If** `Pending` **has no value** (or count is 0) → **Show Notification** "Nothing to
drain" → **Stop This Shortcut**.

### 3. Build the items

**Repeat with Each** over `Pending`:

1. **Format Date** — `Repeat Item`, Date Format **Custom**, format string:

   ```text
   yyyy-MM-dd'T'HH:mm:ssZ
   ```

   Set the date to the reminder's **Creation Date** (tap the magic-variable and pick
   Creation Date). **Set Variable** → `CreatedAt`.

   > The custom format is not optional. Shortcuts' built-in date styles render differently
   > depending on locale, region and 12/24-hour settings, and the formatted string is half
   > the `externalId`. If it ever changes shape, every pending reminder looks new and gets
   > imported a second time.

2. **Text** action containing exactly:

   ```text
   {CreatedAt}|{Repeat Item — Name}
   ```

   **Set Variable** → `ExternalId`.

3. **Dictionary** with four keys:

   | Key          | Value                                                                                     |
   | ------------ | ----------------------------------------------------------------------------------------- |
   | `name`       | `Repeat Item` → Name                                                                      |
   | `note`       | `Repeat Item` → Notes                                                                     |
   | `deadline`   | `Repeat Item` → Due Date, run through another **Format Date** with the same custom format |
   | `externalId` | `ExternalId`                                                                              |

4. **Add to Variable** → `Items`.

Leave `deadline` out of the dictionary entirely for reminders with no due date, or send it
as an empty value — the server treats absent and empty alike. Do not send the literal text
"null".

### 4. Post the batch

**Get Contents of URL**:

- URL: `{BaseURL}/api/agent/capture`
- Method: **POST**
- Headers:
  - `Authorization` → `Bearer {ApiKey}`
  - `Content-Type` → `application/json`
  - `x-vercel-protection-bypass` → `{BypassSecret}` _(only if you set one)_
- Request Body: **JSON**
  - `externalSource` (Text) → `apple_reminders`
  - `items` (Array) → the `Items` variable

**Set Variable** → `Response`.

### 5. Complete the reminders — only on success

**Get Dictionary Value** `ok` from `Response`. **If** it **is** `true`:

- **Repeat with Each** over `Pending` → **Mark as Completed** (`Repeat Item`)
- **Get Dictionary Value** `data.created` and `data.skipped` from `Response`
- **Show Notification**: `Drained: {created} new, {skipped} already there`

**Otherwise**:

- **Get Dictionary Value** `error.message` from `Response`
- **Show Notification**: `Drain failed: {message}` — and leave the reminders alone.

Never move the completion step above the POST. A reminder marked complete before a failed
request is a captured thought that reached nowhere, which is the one failure this whole
feature is meant to prevent.

### 6. Run it

Add it to the Home Screen, or say "Hey Siri, drain reminders" (the Shortcut's name is the
phrase). Add two reminders by voice, run it, and check the Inbox.

Then run it again with the list already drained — it should say "Nothing to drain".

## Production setup

Identical to the Alfred workflow; see `tools/alfred/README.md` → **Production (real app)
setup** for the full detail.

1. **Vercel env**: `PLANNER_AGENT_API_KEY` in Project → Settings → Environment Variables →
   Production. Redeploy if the running deployment predates it.
2. **Deployment Protection**: bare HTTP hits get `401 Protected deployment` while Vercel
   Authentication is on. Either disable it for Production (humans still sign in through the
   app's own login), or enable **Protection Bypass for Automation** and put that secret in
   the `BypassSecret` variable.

## Security

- The API key maps to the single owner user (see `docs/agent-api.md`).
- Keep the key and bypass secret in the Shortcut's own text actions. If you share the
  Shortcut — including via iCloud link — **the secrets go with it**. Clear them first.

## Known limitation

The `externalId` is `"<creation date>|<name>"` because the Shortcuts Reminders actions do
not reliably expose a stable identifier. Renaming a reminder _after_ a POST landed but
_before_ the completion step ran changes its id, so the next run imports it again. The
window is small — completion follows a confirmed POST by milliseconds — and the fix is
deleting one task from the Inbox. If a future iOS exposes a real identifier, swap it into
the `ExternalId` text action; the server never parses the value, so nothing else changes.

## Troubleshooting

| Symptom                                                 | Check                                                                                                             |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `Protected deployment` / Vercel 401                     | Protection on and bypass missing or wrong                                                                         |
| `unauthorized`                                          | `ApiKey` does not match **Vercel's** `PLANNER_AGENT_API_KEY`                                                      |
| `PLANNER_AGENT_API_KEY is not configured on the server` | Key only in `.env.local`; add to Vercel and redeploy                                                              |
| `items[N].externalId requires externalSource`           | The JSON body is missing the top-level `externalSource` text field                                                |
| `items must be an array`                                | The `items` body field is set to Text instead of Array                                                            |
| Duplicates on every run                                 | `externalId` is empty or changing — check the Format Date action uses the **custom** format, not a built-in style |
| Reminders completed but nothing imported                | The completion step is running outside the `ok` check                                                             |
| Imported but not in the UI                              | Looking at localhost while the Shortcut hits production, or the reverse                                           |
| Nothing found                                           | Reminders are in a different list, or already marked complete                                                     |
