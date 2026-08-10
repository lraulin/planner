# Overview and Inbox Organizer — Shaping Notes

**Status: active**

## Scope

- A modern Overview for Achieve's five-step productivity process.
- A dedicated GTD-style Inbox processor for one direct Inbox branch at a time.
- A shared hierarchical Project Picker used by Tasks, Overview, and the organizer.
- A Master Contexts catalog/editor and suggestions for existing context inputs.

### Out of scope

- Someday/Maybe or a broader Proposed-project workflow.
- A separate Other Inbox.
- Organizer reminders, calendar recurrence, or full record-detail editors.
- Retrofitting Quick Capture's destination selector.
- Deliberately reproducing Achieve's Win32 visual chrome.

## Key behavior

The Inbox is still an ordinary project containing real task nodes. Processing changes the
current root's classification or placement rather than introducing a second capture-item
model. Direct roots are queue units so nested subtasks travel with their parent branch.

Task and Project preserve the branch outside Inbox. Defer preserves it inside Inbox behind
a dated shelf. Delete removes it deliberately. Calendar and reference note replace only a
leaf, so both are unavailable while descendants exist.

## Design direction

The process spine is the single visual signature: numbered steps connected as a working
loop, horizontal on the desktop and vertical on a phone. Everything around it uses the
existing Archivo / Plex Mono typography, shell/surface tokens, compact controls, and dark
mode. Organizer choices use progressive disclosure so only the selected classification's
focused fields are visible.

## Context

- **Visuals:** `visuals/` contains the supplied Overview, organizer branches, GTD flowchart,
  Choose Project dialog, and Master Contexts dialog.
- **Achieve source:** `docs/achieve-planner/`, especially `workflow-and-training.md`, the
  user manual, and online help.
- **Prior Planner intent:** the frozen Inbox Quick Capture spec established Inbox as a
  normal project and processing as movement/conversion of real nodes.
- **Product alignment:** Achieve workflow fidelity with modern UX and multi-user-safe data.

## Confirmed product decisions

- Focused outcome forms rather than full editors.
- Required future date for Defer; optional follow-up creates a subtask; no reminder/state.
- Calendar creates a real appointment before removing the Inbox source.
- New Tasks is a count only.
- Overview adds Organize Tasks and omits unknown Other Inbox.
- Existing observed context values populate the initial master catalog; no predefined seed.
- Master-context deletion affects only the catalog.
