# Shape Spec

Gather context and structure planning for significant work. **Run this command while in plan mode.**

## Important Guidelines

- **Always use the structured question tool** when asking the user anything:
  `AskUserQuestion` (Claude Code) or `ask_user_question` (Grok). Prefer options the user
  can confirm, adjust, or correct.
- **Offer suggestions** — Present options the user can confirm, adjust, or correct
- **Keep it lightweight** — This is shaping, not exhaustive documentation
- **Specs stay useful after planning** — See **Spec lifecycle** below. Implementation will
  refine intent; the active folder is a working document until freeze.
- **Harness-agnostic** — Same command works in Claude Code and Grok (via `.claude/commands/`
  flat symlinks). Plan mode is required on both (`/plan` or the plan-mode toggle).

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

| Phase | What happens |
| --- | --- |
| **Shape** (this command) | Create the folder; documents start as **active** |
| **Implement** | Execute tasks; on *material* requirement/design/scope changes (including user feedback on what was built), update `plan.md` / `shape.md` and append to **Changes from original plan** |
| **Freeze** | When verified, mark **frozen / complete**; durable as-built record. Future work → new delta-spec or dated change section |

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

If this is a **delta** on a frozen spec, note which folder it extends and what remains
out of scope for the new slice.

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

### Step 3: Identify Reference Implementations

Use AskUserQuestion:

```
Is there similar code in this codebase I should reference?

Examples:
- "The comments feature is similar to what we're building"
- "Look at how src/features/notifications/ handles real-time updates"
- "No existing references"

(Point me to files, folders, or features to study)
```

If references are provided, read and analyze them to inform the plan. Prefer citing
related **frozen** specs under `agent-os/specs/` when they document prior decisions.

### Step 4: Check Product Context

Check if `agent-os/product/` exists and contains files.

If it exists, read key files (like `mission.md`, `roadmap.md`, `tech-stack.md`) and use AskUserQuestion:

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

Read the confirmed standards files to include their content in the plan context.

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
- **standards.md** — Relevant standards that apply to this work
- **references.md** — Pointers to reference implementations studied
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
- Patterns from reference implementations (Step 3)
- Constraints from standards (Step 5)

Each task should be specific and actionable.

Remind the implementer (in plan.md body or closing note) of the standing rule:

> While this spec is **active**, when we make a material change to requirements, design,
> or scope (including from feedback on what was implemented), update the relevant sections
> and append to **Changes from original plan**. Skip pure implementation details. Freeze
> when verified.

### Step 9: Ready for Execution

When the full plan is ready:

```
Plan complete. When you approve and execute:

1. Task 1 will save all spec documentation first (Status: active)
2. Implementation tasks proceed; keep the active spec current for material refinements
3. Final task freezes the spec and updates the roadmap if needed

Ready to start? (approve / adjust)
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

| # | Change | Why |
| --- | --- | --- |
| | _(filled during implement)_ | |

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

Include the full content of each relevant standard:

```markdown
# Standards for {Feature Name}

The following standards apply to this work.

---

## api/response-format

[Full content of the standard file]

---

## api/error-handling

[Full content of the standard file]
```

## references.md Content

```markdown
# References for {Feature Name}

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
  was built and why — if freeze captured the *actual* decisions, not only the first guess.
- **Delta specs** — Prefer a new folder for substantial follow-on work rather than unfreezing
  an old one.
