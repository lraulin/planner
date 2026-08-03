# Product Mission

## Problem

Effexis Achieve Planner was the best time-management app Lee has used, but it is a
Windows-only desktop application whose development ceased long ago. There is no modern
equivalent: today's planning tools either capture tasks without helping schedule them into
real time, or are heavyweight project-management suites unsuited to personal planning.

This product is a web-based reimplementation of the Achieve Planner workflow — a planner
that survives its platform.

**Note on originality:** For personal use, close fidelity to Achieve Planner is the goal.
If the product is ever marketed publicly, it would need revisiting to ensure it is legally
distinct from Effexis' work. That is out of scope for now.

**Achieve reference material:** How Achieve worked and was intended to be used is captured
under [`docs/achieve-planner/`](../../docs/achieve-planner/README.md) (user manual,
workflow/training from the Effexis site, online help, FAQ, file formats). Agents should
consult that pack when clarifying AP semantics; see also `Agents.md`.

## Target Users

Primarily Lee — a single user, personally. However, the system is built **multi-user
ready** from the start: accounts, per-user data isolation, and anything else that would be
expensive to retrofit are designed in up front, so opening it up later doesn't require a
rewrite. Multi-user features are not activated in the MVP.

## Solution

Four things distinguish it:

- **Achieve's workflow as the foundation.** Faithfully reproduces the Achieve Planner
  model — hierarchical project/task outline, weekly planning process, time-blocked calendar
  — which no modern app replicates. Default when ambiguous: match Achieve. Where we
  deliberately improve (shelving model, day page, GTD-shaped surfaces later), that is
  product intent, not accidental drift — see `roadmap.md` and `docs/achieve-planner/`.
- **Cross-platform via the web.** Runs in any browser instead of being locked to Windows
  desktop; reachable from phone, tablet, and any OS.
- **Own your data.** Full export, no lock-in, no subscription — so this planner can't be
  abandoned out from under its user the way the original was.
- **Modern UX on a proven model.** Keeps the underlying methodology while replacing the
  dated Win32 interface with a fast, keyboard-driven one.
