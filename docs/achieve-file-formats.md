# Achieve Planner file formats

How Achieve stores and exchanges data, and how we plan to import/export it.

Sources: real files under Dropbox `AppDocuments/Achieve Planner`, the Wine install of
Achieve 2 (`Achieve2.exe` command IDs), `docs/APReleaseLog.txt`, and the Full XML dump
`Achieve-Feb-2011XML.achxml`.

## Three interchange paths (plus native)

| UI                  | Command ID         | Role                                                          |
| ------------------- | ------------------ | ------------------------------------------------------------- |
| **Full XML export** | `FileXMLDump`      | Dump the **entire** live database as ADO.NET DataSet XML      |
| **Load from XML**   | `FileOpenFromXML`  | **Open/replace** the current file from a full XML dump        |
| **Export branch**   | `FileExportBranch` | Export a selected outline branch (RA / projects / tasks only) |
| **ACX file import** | `FileACXImport`    | **Merge** that branch package into the open file              |

Also:

| Extension                | Role                                                         |
| ------------------------ | ------------------------------------------------------------ |
| **`.ach`**               | Native binary data file (day-to-day save format)             |
| **`.achxml` / Full XML** | Whole-file DataSet XML (same logical model as `.ach`)        |
| **`.acx`**               | Branch exchange package (pair of Export branch / ACX import) |

Native `.ach` is not the preferred interchange surface. Prefer Full XML for migration and
ACX for selective branch exchange once we have a sample `.acx`.

```
.ach  ──Full XML export──►  .achxml / Full XML
.achxml ──Load from XML──►  .ach (replaces open file)

outline branch ──Export branch──►  .acx
.acx ──ACX import──►  merge into open .ach
```

## Native `.ach` (binary)

All observed files share a fixed 16-byte magic, then version fields, then a proprietary
serialization of the same DataSet as Full XML:

```
08 2d 23 65 a5 7f ac 62 43 af 97 f6 87 50 fa 28   # magic
… version / flags …
[dataset properties: AchieveDB, MajorDatabaseVersion, …]
[for each table:]
  ba ed fe de ba ed fe   # 0xDEFEEDBA twice, little-endian
  u8 nameLen + tableName
  u32 columnCount
  column descriptors + row data
```

- Entropy is mid-range (~5.5–6): structured binary, not full encryption.
- Table names, field names, and RTF notes appear as plaintext strings.
- `MajorDatabaseVersion` observed as **15** across Sample / 2017 / 2020 / 2022 files.
- `Default.dat` in the install is a blank `.ach` (same magic).

Reading `.ach` without Achieve is possible later; writing valid `.ach` is high cost. For
migration, open in Wine Achieve and Full-XML-export.

## Full XML (`.achxml`)

ADO.NET `DataSet.WriteXml` with schema. Shape:

```xml
<?xml version="1.0" standalone="yes"?>
<AchieveDB>
  <xs:schema id="AchieveDB" … msdata:IsDataSet="true"
    msprop:MajorDatabaseVersion="15"
    msprop:DatabaseVersion="83"
    …>
    … table definitions …
  </xs:schema>
  <ResultAreas>…</ResultAreas>
  <Projects>…</Projects>
  <Tasks>…</Tasks>
  …
</AchieveDB>
```

- About **74 tables** (outline, appointments, goals/wishes, contacts, metrics, UI chrome,
  Outlook sync, …).
- Primary keys are **GUIDs** (string form).
- Sibling order is **`__ORDINAL__`** (int).
- Hierarchy is **per-type parent pointers**: `ParentResultAreaId`, `ParentProjectId`,
  `ParentTaskId` (not a single parent column).

Core outline tables for import v1:

| Table                  | Parent link                        | Notes           |
| ---------------------- | ---------------------------------- | --------------- |
| `ResultAreaCategories` | —                                  | Work / Personal |
| `ResultAreas`          | `ParentResultAreaId`, `CategoryId` |                 |
| `Projects`             | `ResultAreaId`, `ParentProjectId`  | 70+ columns     |
| `Tasks`                | `ProjectId`, `ParentTaskId`        | 60+ columns     |

Also present and useful later: `Goals`, `Wishes`, `Dreams`, `Appointments`,
`AppointmentRecurrence`, `NoteItems`, `TimeCharts` / `TimeChartAreas`.

### Encodings

**Priority** (int, default `100000` = none):

| Band       | Meaning                         |
| ---------- | ------------------------------- |
| `1, 2, 3…` | A1, A2, A3… (rank is the value) |
| `2500`     | B (no rank); `2501` = B1        |
| `5000`     | C; `5001` = C1                  |
| `7500`     | D; `7501` = D1                  |
| `100000`   | no priority                     |

Letter bases are 0 / 2500 / 5000 / 7500; rank is the offset within the 2500-wide band (for
A, the stored value _is_ the rank).

**Percent complete:** `0…10000` → 0%…100% (`10000` = fully done). We store 0–100.

**Status** (int on Projects/Tasks) — Achieve order, correlated with `IsCompleted` on real
data; codes after 3 are provisional until confirmed in the UI:

| Code | State                          |
| ---: | ------------------------------ |
|    0 | not_started                    |
|    1 | in_progress                    |
|    2 | waiting                        |
|    3 | completed (`IsCompleted=true`) |
|    4 | postponed                      |
|    5 | delegated                      |
|    6 | should_delegate                |
|    7 | cancelled                      |
|    8 | proposed                       |

**Effort / duration units** (observed): `0` = minutes, `1` = hours. Values are stored in
those units; convert to minutes on import.

**Notes:** RTF (`{\rtf1\ansi…}`), not plain text. Strip or convert on import.

**Recurrence:** `IsRecurring` + base64 `BinRecurrenceData` (opaque binary blob). Appointments
also use the `AppointmentRecurrence` table. Decode later against our recurrence model.

**TC priority:** same int encoding as outline priority, on `TCPriority`.

## ACX (branch exchange)

Not yet sampled in this repo. Strong hypothesis: DataSet XML (or a thin wrapper) containing
only Result Areas, Projects, and Tasks for the exported branch — the only types the release
log says can be imported/exported this way.

Generate a sample: open Achieve → select a branch → File → Export branch → save `.acx`,
then document root element and table set here.

## Mapping to this planner

| Achieve                      | Ours                                         |
| ---------------------------- | -------------------------------------------- |
| ResultAreas tree             | `nodes` type `result_area`                   |
| Projects tree                | `nodes` type `project` (+ `project_details`) |
| Tasks tree                   | `nodes` type `task` (+ `task_details`)       |
| Priority int                 | `priorityLetter` + `priorityRank`            |
| TCPriority int               | `tcPriorityLetter` + `tcPriorityRank`        |
| Status int                   | `nodeStateEnum`                              |
| `__ORDINAL__` among siblings | `sortKey` (fractional index)                 |
| Per-type parents             | unified `parentId` with nest rules           |
| Notes RTF                    | `nodes.notes` (plain/markdown best-effort)   |
| Effort fields (minutes)      | `task_details` effort columns                |
| Percent 0–10000              | `percentComplete` 0–100                      |

Code lives under `src/lib/achieve/` (pure parse + map). Database write is a separate
mutation layer and is not required for the encodings/parser tripwires.

## Planner import / export (implemented)

| Action     | Where                            | What                                                                                          |
| ---------- | -------------------------------- | --------------------------------------------------------------------------------------------- |
| **Import** | Settings → Achieve Planner (XML) | Full XML → outline (RA / goals / dreams / projects / tasks). Modes: **Replace** or **Merge**. |
| **Export** | Same panel                       | Outline → `.achxml` download (same core tables).                                              |

Code:

- `src/lib/achieve/parseXml.ts` / `mapOutline.ts` / `encodings.ts` — pure parse + map
- `src/lib/achieve/import.ts` — DB write (`userId`-scoped; `externalSource = "achieve"`)
- `src/lib/achieve/exportXml.ts` / `exportLoad.ts` — XML build from `loadOutline`
- HTTP: `POST /api/achieve/import` (multipart), `GET /api/achieve/export` — not Server
  Actions; multi-MB XML breaks Flight serialization
- Settings UI: `AchieveTransferPanel`

**On the PC:** Achieve → Full XML export → save under Dropbox → Settings → Import on the Mac.

**Round-trip note:** We export without the huge embedded XSD. AP’s Load from XML usually infers schema from data rows for this subset; if a build is picky, open once in AP and re-save.

## Design clues from the format (useful for us)

Things the DataSet makes obvious that we already align with or should keep in mind:

1. **Separate outline priority vs Task Chooser priority** — `Priority` and `TCPriority` are independent ints on the same row. We model that as `priorityLetter` vs `tcPriorityLetter`. Don’t merge them.

2. **State is user-set; schedule status is derived** — `Status` / `IsCompleted` live on the record; AP also has a derived “On Schedule / Need to Start” column that is _not_ this field. Keep that split.

3. **Percent complete is fine-grained** — 0–10000 (hundredths of a percent). We store 0–100; import rounds.

4. **Effort is three-valued on tasks** — Low / Best / High estimates plus Effort Left and Actual. We only keep a single expected effort (prefer Best, else Low) plus left/actual. Three-point estimates are a possible later enhancement if planning math needs them.

5. **Project “Show only next task in chooser”** — `ShowOnlyNextTaskInChooser` maps to our `onlyShowNextTask`. AP treats the outline as a plan and the chooser as a work queue; leaf-gating is intentional.

6. **Default time per week / project block size** — calendar planning inputs on the project, not computed. We already have columns; import fills them when present.

7. **Result-area Importance (0–100) + reason** — feeds Task Chooser scoring in AP. We store `importance` and `reason`; keep them for score parity.

8. **Mission / Vision / SWOT on result areas** — first-class prose columns in the dump, not freeform notes. We already have matching detail fields; import fills them from Full XML.

9. **Recurrence blob is opaque** — `BinRecurrenceData` is base64 binary, not XML fields. Appointment recurrence is a _separate_ table (`AppointmentRecurrence` with Pattern/Period/Data1/Data2). Task recurrence ≠ appointment recurrence in storage; our split (task recurrence on `task_details`, appointment series on `appointments`) matches that philosophy.

10. **`__ORDINAL__` is sibling order** — not a global rank. We use fractional `sortKey` for the same job.

11. **Focus flag** — boolean on projects/tasks for “current focus” filtering. We have `focus`; import/export it.

12. **Categories are light** — `ResultAreaCategories` is just name + WorkRelated. We store category as text on the result area; good enough until we need a global category list.

## Skipped tables → roadmap cues

After a real import, the UI lists tables present in the file but not yet mapped. Use that
list (and the tiers below) as a backlog, not a promise.

| Tier         | Tables                                                                                   | Why it matters                           |
| ------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Done**     | ResultAreaCategories, ResultAreas, Dreams, Goals, Projects, Tasks                        | Outline core                             |
| **Done**     | Appointments; TimeCharts + TimeChartAreas; Wishes; NoteItems; LabelData colours          | Calendar, ideal week, wish list, notes   |
| **Done**     | Metrics + MetricTracking                                                                 | Metrics tab + tracking history           |
| **A — next** | AppointmentRecurrence (full rule decode); ProjectObjectives/Risks/…; GoalSteps/Actions/… | Series masters + detail-form child lists |
| **B**        | Labels; Contacts                                                                         | Separate product lines                   |
| **C**        | FormLayouts, RecordView*, SyncItems, ActiveSync*, Users, Images, Resources*              | UI chrome / Outlook                      |

### Goal import notes

- Achieve often links a goal to a **project** via `ProjectId` without nesting either under
  the other. We place the goal under the project’s result area, then **reparent the project
  under the goal** so our RA → goal → project shape holds.
- Empty `Title` is common; we fall back to `Definition`, then “(Untitled goal)”.
- Dreams import as goals with `isDream`.

### Extras import notes

- **Time chart areas:** one AP row per weekday → merged into multi-day `daysOfWeek` when
  name/time/duration match. Wall-clock start from the ISO string (not local TZ conversion).
- **Appointments:** check state, free/busy, project link, reminders. Recurring series land
  as the stored instance dates for now (rule table not fully decoded).
- **Wishes:** `node_items` on the result area (or first RA if unassigned).
- **Notes:** separate `notes` table; RTF stripped.

## What we intentionally skip (for now)

- Writing native `.ach`
- ACX branch format (until we have a sample)
- Remaining Tier A–C tables above
- Perfect RTF and `BinRecurrenceData` fidelity
- Smart merge by Achieve GUID (re-import in merge mode currently duplicates)
