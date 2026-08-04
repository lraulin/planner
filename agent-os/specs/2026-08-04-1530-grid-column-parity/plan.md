# Grid Column Parity

**Status: frozen / complete** (2026-08-04)  
Spec folder: `agent-os/specs/2026-08-04-1530-grid-column-parity/`

## Context

Planner's shared grids already persist their Show Fields choices separately from each
view's default order. The supplied Achieve Planner field inventory establishes the
reference set for the app's main tabs, including several tabs Planner has not built.

Full field inventory: [`docs/achieve-planner/grid-columns.md`](../../../docs/achieve-planner/grid-columns.md).

## Decisions

| Decision         | Choice                                                                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Defaults         | Do not change any default column order or visible field. New fields are optional through Show Fields.                                                           |
| Coverage         | Add a column when Planner has a faithful stored or derived value; do not add a blank placeholder or invent a data model solely to fill a grid menu.             |
| Shared values    | Load the type-specific values required for grids in `loadOutline`; detail-only fields remain detail-only.                                                       |
| Derived ancestry | Result Area Name and Project Priority are derived once with the other tree values, not re-walked independently by each cell.                                    |
| Semantics        | Existing `Effort` is Planner's Expected Effort and `L.A.P.` is Lowest Ancestor Priority; do not duplicate identical columns under alternate labels.             |
| Metrics status   | Do not guess an objective direction or status formula. `Last Date` is added; Metrics `Status` stays documented as unavailable until its semantics are designed. |
| Metrics layout   | Metrics is still a purpose-built table (not DataGrid), so Last Date is always visible rather than Show Fields–gated.                                            |

## In scope (as built)

- Optional columns for Tasks, Projects, Outline, and Goals where Planner has data.
- Metrics Last Date on the fixed metrics table.
- Full reference inventory including unbuilt Contacts, File Organizer, Resources, and Time Charts.
- Coverage matrix below for supported vs intentionally unsupported AP fields.

## Out of scope (as built)

- Contacts, File Organizer, Resources, or a standalone Time Charts tab.
- Predecessors, task-level assignees (only project `assignedTo` exists), effort estimate ranges (best/max), DescriptionName.
- Metric-status semantics (needs objective direction).
- Changing default layouts, adding database fields, or inline editors solely because a read-only display column is newly available.
- Converting Metrics to DataGrid.

## Acceptance criteria

- [x] Every field with a faithful existing value appears in the appropriate implemented
      tab's Show Fields list, without changing the fields visible by default.
- [x] Shared date, money, text, boolean, effort and ancestry fields sort/filter/search
      consistently wherever they are offered.
- [x] The whole supplied AP inventory is available as a durable local reference, including
      tabs not yet implemented and Planner coverage notes.
- [x] Derived Result Area Name and Project Priority have pure unit coverage.
- [x] Unit tests, typecheck, lint and formatting pass.

## Coverage matrix

### Tasks

| AP field                   | Planner                 | Notes                                |
| -------------------------- | ----------------------- | ------------------------------------ |
| Abbreviated State          | ✓ default (`abbrState`) |                                      |
| Priority                   | ✓ default               |                                      |
| Name                       | ✓ default               |                                      |
| Expected Effort            | ✓ default (`effort`)    | Same stored field                    |
| Effort Left                | ✓ default               |                                      |
| Deadline                   | ✓ default               |                                      |
| Percent Completed          | ✓ default (`percent`)   |                                      |
| Schedule Status            | ✓ default (`status`)    |                                      |
| Actual Effort              | ✓ optional              |                                      |
| Actual Start Date          | ✓ optional              | Task-only stored                     |
| Completed                  | ✓ optional              | Flag from state                      |
| Contexts                   | ✓ optional              |                                      |
| Cost to Date               | ✓ optional              | Task `actual_cost`                   |
| Date Created / Modified    | ✓ optional              | Node timestamps                      |
| Deadline Lead Time         | ✓ optional              |                                      |
| Defer To Date              | ✓ optional              |                                      |
| Description                | ✓ optional              |                                      |
| Effort Driven              | ✓ optional              |                                      |
| Focus                      | ✓ optional              | Editable                             |
| High / Low cost estimate   | ✓ optional              |                                      |
| Lead Time                  | ✓ optional              |                                      |
| Place                      | ✓ optional              |                                      |
| Date Completed             | ✓ optional              | Task calendar date                   |
| State (full label)         | ✓ optional              | Beside abbr state                    |
| Target Start / End         | ✓ optional              |                                      |
| Assignee(s)                | ✗                       | No task-level assignee; project only |
| Best / Max Effort Estimate | ✗                       | Only expected effort modeled         |
| Expected Cost              | ✗                       | Project-only field                   |
| DescriptionName            | ✗                       | AP UI composite; not modeled         |
| Predecessors               | ✗                       | Not modeled                          |
| TC Priority                | ✓ optional (extra)      | Planner chooser field                |

### Projects

| AP field                          | Planner             | Notes                             |
| --------------------------------- | ------------------- | --------------------------------- |
| Abbreviated State, Priority, Name | ✓ default           |                                   |
| Active Task Count                 | ✓ default (`tasks`) | Shown as active/total             |
| Expected Effort, Effort Left      | ✓ default           |                                   |
| Target Start, Deadline, %         | ✓ default           |                                   |
| Schedule Status, L.A.P.           | ✓ default           | L.A.P. = Lowest Ancestor Priority |
| Purpose, Assignee(s)              | ✓ (view presets)    | Delegation / purpose views        |
| Actual Effort, Actual Start       | ✓ optional          | Start is task-shaped when present |
| Completed, Contexts               | ✓ optional          |                                   |
| Date Completed / Created          | ✓ optional          |                                   |
| Description, Effort Driven        | ✓ optional          |                                   |
| Expected / High / Low Cost        | ✓ optional          |                                   |
| Focus, Lead Time, Place           | ✓ optional          |                                   |
| Result Area Name                  | ✓ optional          | Derived                           |
| State (full), Target End          | ✓ optional          |                                   |
| Name (Smaller)                    | ✗                   | Presentation variant of Name      |

### Outline

| AP field                                        | Planner                   | Notes                            |
| ----------------------------------------------- | ------------------------- | -------------------------------- |
| Priority, Name, Effort, Deadline, State, Focus  | ✓ default                 |                                  |
| Category                                        | ✓ optional (pre-existing) | Inherited                        |
| Actual Effort, Assignee(s), Completed, Contexts | ✓ optional                | Assignee is project `assignedTo` |
| Date Completed / Created / Modified             | ✓ optional                |                                  |
| Defer To, Description, Effort Driven            | ✓ optional                |                                  |
| Effort Left, Importance, Lead Time              | ✓ optional                | Importance is result-area        |
| Target Start / End, Icon                        | ✓ optional                |                                  |
| Project Priority, Abbr State                    | ✓ optional                | Project Priority ≠ L.A.P.        |
| Schedule Status, L.A.P.                         | ✓ optional                |                                  |
| Predecessors                                    | ✗                         | Not modeled                      |

### Goals

| AP field                                             | Planner                   | Notes               |
| ---------------------------------------------------- | ------------------------- | ------------------- |
| Priority, Title, Definition, Status, Deadline, Range | ✓ default                 | Status = node state |
| Date Completed, Purpose                              | ✓ optional                |                     |
| Category                                             | ✓ optional (pre-existing) |                     |

### Metrics

| AP field                                                        | Planner  | Notes                            |
| --------------------------------------------------------------- | -------- | -------------------------------- |
| Active, Priority, Title, Category, Question, Target, Last Value | ✓ always | Fixed table                      |
| Last Date                                                       | ✓ always | Added this slice                 |
| Status                                                          | ✗        | Needs objective direction design |

### Notes / Wish List

| Tab                                                          | Status                                 |
| ------------------------------------------------------------ | -------------------------------------- |
| Notes (Flag, Subject, Date, Contexts + Title/Preview/Linked) | Already covered; Title maps Flag Title |
| Wish List (Priority, Type, Title, Description)               | Already covered                        |

### Unbuilt tabs (reference only)

Contacts, File Organizer, Resources, Time Charts — listed in `grid-columns.md`; no UI yet.

## Changes from original plan

| #   | Change                                                         | Why                                      |
| --- | -------------------------------------------------------------- | ---------------------------------------- |
| 1   | Metrics Last Date always visible                               | Metrics is not on DataGrid / Show Fields |
| 2   | Projects reuse shared `lap` / `purpose` / `assignee` factories | Same values, one definition              |
| 3   | Outline builds columns with `today`                            | Schedule Status needs a day key          |

## Implementation tasks

1. [x] Record the complete AP inventory and coverage decisions.
2. [x] Widen the outline read model for fields that grids can faithfully display and derive the
       two ancestry values.
3. [x] Add reusable optional columns, then register them on Tasks, Projects, Outline and Goals.
4. [x] Add Metrics Last Date, verify defaults unchanged, freeze this spec.
