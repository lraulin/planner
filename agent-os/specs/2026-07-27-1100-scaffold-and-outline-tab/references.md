# References for Scaffold + Outline Tab

## Similar Implementations

**None in this codebase.** The repository contained only documentation and Agent OS config
when this spec was shaped — this is the first application code.

## External Reference: Effexis Achieve Planner

The product being reimplemented. Reference material gathered during shaping:

### Screenshots

- **Location:** `visuals/` in this spec folder; originals in the repo root `screenshots/`
- **Relevance:** The authoritative source for layout, columns, and terminology
- **Key patterns:**
  - `OutlineTabSS.png` — **primary reference for this spec.** Tab bar
    (Outline / Projects / Tasks / Weekly Schedule / Notes); header toggles (Group by
    Category, Show Result Areas, Show Goals, Show Tasks, Next Actions Only); columns
    (Icon, Stat, Priori, Name, Deadline, Contexts, Status, Fo); left command panel (New,
    Insert Row, Edit, Move); and the hint bar: _"Press Insert key to add row after,
    Shift+Insert to add row before, Ctrl+Insert to add row as child, Esc to cancel row
    insert."_
  - `ProjectsTabSS.png` — Result Area selector, grouping headers with item counts, and the
    `Tasks` (10/12), `%`, `Status`, `L.A.P.` columns.
  - `TasksTabSS.png` — project-scoped task list with `Effort` / `Effort L` columns.
    Confirms **effort rolls up to parent rows**: "Requirements" shows 7 h = 4 h + 2 h + 1 h.
    Durations render as `45 min`, `2 h`, `3:45 h`, `3 d`.
  - `WeeklyScheduleSS.png` — Time Chart selector ("Ideal Week"), color-coded activity zones
    as calendar background, project blocks as appointments, and a draggable Projects panel.
  - `OverviewTabSS.png` — the Productivity Process: Capture → Organize → Prioritize → Plan →
    Do. Also reveals an inbox ("New Tasks: 1", "Other Inbox: 0"), Contexts, Task Chooser,
    and the Weekly Planning Wizard.

### Vendor documentation

- **Location:** effexis.com (still live over plain HTTP; HTTPS fails). Saved `.mhtml`
  captures of the tour pages are in the repo root `screenshots/`.
- **Relevance:** Confirms terminology and semantics not visible in screenshots
- **Key patterns:**
  - **Projects vs. Tasks** — "Achieve Planner makes a distinction between projects (the
    outcomes) and tasks (the action steps)." Projects are containers for related tasks.
  - **ABCD priorities** — "a letter ('A', 'B', 'C' or 'D') with an optional numeric rank",
    used ranked (`A1`) or unranked (`A`), with customizable per-priority colors.
    A = very important, B = important, C = maybe someday, D = not important enough to do.
  - **Effort fields** — `Effort` (expected effort to complete), `Effort Left` (work still
    needed; can go up if the estimate was low), `Actual Effort` (work actually spent).
  - **Project blocks** — committed time on the weekly schedule, deliberately scheduled at
    the _project_ level rather than the task level to avoid overscheduling; 30 min–2 h is
    the recommended duration. Each block links back to its project.
  - **Time charts / activity zones** — an "ideal week" template (health & fitness, family,
    finances…) rendered as color-coded calendar background.
  - **Automatic scheduling** — expected start/end dates computed from effort estimates,
    priorities, and project blocks, recomputed via a `Reschedule` command, with overdue
    warnings.

  Relevant pages: `/achieve/tour/get-organized.htm`, `/achieve/plan-your-work.htm`,
  `/achieve/tour/work-your-plan.htm`, `/achieve/task-list.htm`, `/achieve/weekly-schedule.htm`

### The running application

Lee still has Achieve Planner running on Windows and can answer behavioral questions
directly — the best resource for resolving the open questions in `shape.md`.
