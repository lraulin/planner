---
name: shape-spec
description: Shape significant Planner work into a saved Agent OS spec before any implementation. Use when the user asks to add a feature, plan a change, or start non-trivial work, and when they invoke /shape-spec or $shape-spec. Requires plan mode.
---

> **Plan mode is required.** If the harness is not in plan mode, stop and ask the user to
> enter it before doing anything else. Treat any text supplied with the invocation as the
> initial feature description.

# Shape Spec

Gather context and structure planning for significant work. **Run this command while in plan mode.**

## Important Guidelines

- **Always use the structured question tool** when asking the user anything. References
  below to `AskUserQuestion` mean the current harness's native facility: `AskUserQuestion`
  (Claude Code), `ask_user_question` (Grok), `vscode_askQuestions` (Copilot), or
  `request_user_input` in Codex plan mode. In another Codex mode, ask one concise direct
  question instead. Prefer options the user can confirm, adjust, or correct.
- **Offer suggestions** — Present options the user can confirm, adjust, or correct
- **Keep it lightweight** — This is shaping, not exhaustive documentation
- **Specs stay useful after planning** — See **Spec lifecycle** below. Implementation will
  refine intent; the active folder is a working document until freeze.
- **Harness-agnostic** — This file is the canonical workflow; `.claude/commands/`,
  `.github/prompts/`, and Codex's `$shape-spec` all point here. Plan mode is required
  (`/plan` or the plan-mode toggle).

## Prerequisites

This command **must be run in plan mode**.

**Before proceeding, check if you are currently in plan mode.**

If NOT in plan mode, **stop immediately** and tell the user:

```
Shape-spec must be run in plan mode. Please enter plan mode first, then run /shape-spec again.
```

Do not proceed with any steps below until confirmed to be in plan mode.

## Spec lifecycle (read this)

Specs under `agent-os/specs/` are version-controlled intent, not throwaway chat notes.

| Phase                    | What happens                                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shape** (this command) | Create the folder; documents start as **active**                                                                                                                                      |
| **Implement**            | Execute tasks; on _material_ requirement/design/scope changes (including user feedback on what was built), update `plan.md` / `shape.md` and append to **Changes from original plan** |
| **Freeze**               | When verified, mark **frozen / complete**; durable as-built record. Future work → new delta-spec or dated change section                                                              |

**Update during implement:** clarified acceptance criteria, design decisions, scope
in/out, non-obvious invariants. **Skip:** minor code details, debug notes, pure
refactors.

Standing rules live in `AGENTS.md` and `agent-os/specs/README.md`. Exemplar freeze:
`agent-os/specs/2026-07-28-1234-weekly-schedule/`.

## Process

### Step 1: Clarify What We're Building

Use AskUserQuestion to understand the scope:

```
What are we building? Please describe the feature or change.

(Be as specific as you like — I'll ask follow-up questions if needed)
```

Based on their response, ask 1-2 clarifying questions if the scope is unclear. Examples:

- "Is this a new feature or a change to existing functionality?"
- "What's the expected outcome when this is done?"
- "Are there any constraints or requirements I should know about?"

If this may be a **delta**, identify its governing prior specs in Step 3 rather than relying
on the user to remember them.

### Step 2: Gather Visuals

Use AskUserQuestion:

```
Do you have any visuals to reference?

- Mockups or wireframes
- Screenshots of similar features
- Examples from other apps

(Paste images, share file paths, or say "none")
```

If visuals are provided, note them for inclusion in the spec folder.

### Step 3: Find Governing Specs and Reference Implementations

Search `agent-os/specs/*/{plan,shape,references}.md` by feature terms and likely touched
paths. Read matching `plan.md` files first, then only the shaping/reference sections needed
to resolve rationale and relationships. For each relevant frozen spec, search whether a
later spec cites its folder. Follow only links whose decisions overlap this work; the graph
may branch. Do not preload `standards.md`, visuals, unrelated specs, or broad git history.

Use specs for intended behavior and rationale. Use path-scoped commits only when the plan
depends on implementation history that the specs do not answer. If specs, code, and history
disagree, surface the mismatch rather than silently choosing one.

Use AskUserQuestion:

```
I found these governing specs and likely code references:

- [spec/path — relevance, including extends/supersedes]
- [code/path — relevance]

Did I miss a governing decision or similar implementation?
```

Record the confirmed relationships near the top of a delta's `plan.md`:

```markdown
## Spec relationships

- **Extends:** `agent-os/specs/{folder}/`
- **Supersedes:** `agent-os/specs/{folder}/` — {specific decision or scope}
```

Use **Extends** for decisions that carry forward and **Supersedes** only for the named
decision being replaced. Omit this block for a root spec.

### Step 4: Check Product Context

Check if `agent-os/product/` exists and contains files.

If it exists, read `mission.md` and `tech-stack.md` in full — they are small. **Do not read
`roadmap.md` whole**; it is ~86 KB across three phase sections (`## Phase 1`, `## Phase 2`,
`## Phase 3`). Grep it for the feature's terms and read only the phase section the matches
fall in.

Then use AskUserQuestion:

```
I found product context in agent-os/product/. Should this feature align with any specific product goals or constraints?

Key points from your product docs:
- [summarize relevant points]

(Confirm alignment or note any adjustments)
```

If no product folder exists, skip this step.

### Step 5: Surface Relevant Standards

Read `agent-os/standards/index.yml` to identify relevant standards based on the feature being built.

Use AskUserQuestion to confirm:

```
Based on what we're building, these standards may apply:

1. **api/response-format** — API response envelope structure
2. **api/error-handling** — Error codes and exception handling
3. **database/migrations** — Migration patterns

Should I include these in the spec? (yes / adjust: remove 3, add frontend/forms)
```

Read the confirmed standards files, then state — in the plan and in `standards.md` — only the
key points that bear on **this** feature, plus any deliberate deviation. Do not restate the
standards themselves: a spec references standards, it never copies them (see AGENTS.md).

### Step 6: Generate Spec Folder Name

Create a folder name using this format:

```
YYYY-MM-DD-HHMM-{feature-slug}/
```

Where:

- Date/time is current timestamp
- Feature slug is derived from the feature description (lowercase, hyphens, max 40 chars)

Example: `2026-01-15-1430-user-comment-system/`

**Note:** If `agent-os/specs/` doesn't exist, create it when saving the spec folder.

### Step 7: Structure the Plan

Now build the plan with **Task 1 always being "Save spec documentation"** and a **final
task for freeze** after verification.

Present this structure to the user:

```
Here's the plan structure. Task 1 saves all our shaping work before implementation begins.
The last task freezes the spec once the feature is verified.

---

## Task 1: Save Spec Documentation

Create `agent-os/specs/{folder-name}/` with:

- **plan.md** — This full plan (**Status: active**), including empty **Changes from original plan**
- **shape.md** — Shaping notes (scope, decisions, context from our conversation)
- **standards.md** — Which standards apply, why, and any deviations (references, not copies)
- **references.md** — Governing specs and reference implementations studied
- **visuals/** — Any mockups or screenshots provided

## Task 2: [First implementation task]

[Description based on the feature]

## Task 3: [Next task]

...

## Task N: Verify, freeze spec, update roadmap

- Confirm acceptance criteria
- Update plan/shape for any material as-built drift; complete **Changes from original plan**
- Mark files **Status: frozen / complete** (date); list follow-ups as new work
- Update `agent-os/product/roadmap.md` if this delivers a roadmap item

---

Does this plan structure look right? I'll fill in the implementation tasks next.
```

### Step 8: Complete the Plan

After Task 1 is confirmed, continue building out the remaining implementation tasks based on:

- The feature scope from Step 1
- Governing decisions and patterns from Step 3
- Constraints from standards (Step 5)

Each task should be specific and actionable.

Remind the implementer (in plan.md body or closing note) of the standing rule:

> While this spec is **active**, when we make a material change to requirements, design,
> or scope (including from feedback on what was implemented), update the relevant sections
> and append to **Changes from original plan**. Skip pure implementation details. Freeze
> when verified.

### Step 9: Save the Spec, Then Stop

When the full plan is ready, present it for approval. Once the user approves, execute
**Task 1 only** — write the spec folder — and then **stop here**. End the turn with the
handoff below. Do not begin Task 2, and do not offer to.

Implementation runs in a fresh session so the shaping context — every spec read, the product
docs, the whole Q&A — does not ride along into it.

```
Spec saved: agent-os/specs/{folder}/ (Status: active)
Next: start a new session and say "implement agent-os/specs/{folder}", beginning at Task 2.
```

## Output Structure

The spec folder will contain:

```
agent-os/specs/{YYYY-MM-DD-HHMM-feature-slug}/
├── plan.md           # The full plan (active → later frozen)
├── shape.md          # Shaping decisions and context
├── standards.md      # Which standards apply and key points
├── references.md     # Pointers to similar code
└── visuals/          # Mockups, screenshots (if any)
```

## plan.md Content

```markdown
# {Feature Name}

**Status: active**  
Spec folder: `agent-os/specs/{folder-name}/`

## Spec relationships

[Omit for a root spec. For a delta, list each **Extends** / **Supersedes** relationship
using the canonical folder path; name the scope of every supersession.]

## Context

[Why this work exists; product/roadmap links]

## Decisions

- [Key decisions from shaping]
- [Constraints]

## Acceptance criteria

- [ ] [Observable outcomes]

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

## Task 1: Save Spec Documentation

...

## Task N: Verify, freeze spec, update roadmap

...
```

## shape.md Content

The shape.md file should capture:

```markdown
# {Feature Name} — Shaping Notes

**Status: active**

## Scope

[What we're building, from Step 1]

### Out of scope

- [Explicit non-goals]

## Decisions

- [Key decisions made during shaping]
- [Constraints or requirements noted]

## Context

- **Visuals:** [List of visuals provided, or "None"]
- **References:** [Code references studied]
- **Product alignment:** [Notes from product context, or "N/A"]

## Standards Applied

- api/response-format — [why it applies]
- api/error-handling — [why it applies]
```

## standards.md Content

**References, not copies.** List the paths and why each applies; never inline the standards
text. Pin the standards commit instead — `git show <sha>:agent-os/standards/<path>` recovers
exactly what applied at shape time.

```markdown
# Standards for {Feature Name}

Applied as of standards commit `{sha}`. References, not copies — see AGENTS.md.

- `agent-os/standards/components/data-grid.md` — {why it applies here}
- `agent-os/standards/development/testing.md` — {why it applies here}

## Deviations

{Each deliberate divergence, stated in full — this is the part that is not recoverable
from the standards file, so it is the part worth writing down. Or "None."}
```

## references.md Content

```markdown
# References for {Feature Name}

## Governing specs

### `agent-os/specs/{folder}/`

- **Relationship:** Extends / supersedes {specific decision}
- **Relevant decisions:** [What carries forward or changes]

## Similar Implementations

### {Reference 1 name}

- **Location:** `src/features/comments/`
- **Relevance:** [Why this is relevant]
- **Key patterns:** [What to borrow from this]

### {Reference 2 name}

...
```

## Freezing (implement / close-out)

When Task N (or equivalent) runs after verification:

1. Set `**Status: frozen / complete** (YYYY-MM-DD)` on `plan.md` and `shape.md` (and
   optionally other files in the folder).
2. Align scope, decisions, and acceptance criteria with **as-built** reality.
3. Ensure **Changes from original plan** captures material drift.
4. Move leftover ideas to **Follow-ups (new work — not amendments to this frozen spec)**.
5. Update `agent-os/product/roadmap.md` when this completes a listed item.
6. Do not keep editing the frozen folder for new features — open a new spec.

## Tips

- **Keep shaping fast** — Don't over-document. Capture enough to start, refine as you build
  (and write those refinements into the active spec).
- **Visuals are optional** — Not every feature needs mockups.
- **Standards guide, not dictate** — They inform the plan but aren't always mandatory.
- **Specs are discoverable** — Months later, someone can find this spec and understand what
  was built and why — if freeze captured the _actual_ decisions, not only the first guess.
- **Delta specs** — Prefer a new folder for substantial follow-on work rather than unfreezing
  an old one.
