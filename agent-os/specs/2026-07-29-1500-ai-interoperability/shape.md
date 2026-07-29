# AI Interoperability MVP — Shaping Notes

**Status: frozen / complete** (2026-07-29)

## Scope

HTTP agent API in the planner app plus a thin separate repo of instructions/skills so Grok Build or Claude Code can operate the plan: read context, capture work, mark done, notes, light schedule, and interactive weekly planning equivalent to the UI wizard.

### Out of scope

- In-app chatbot, Bedrock, full Better Auth, Alfred, MCP-first packaging
- Migrating personal-assistant-docs markdown into the database

## Decisions

- **Separate agent repo** — avoid opening the Next.js tree as agent context
- **Bearer API key only** for this slice; Better Auth next
- **Tool-shaped POST endpoints** mapping cleanly to a future MCP server
- **No dual write path** — handlers call existing `src/lib/**` only
- **Prefer summary + search tools** over dumping the outline into every prompt
- _*Invent api/* standards_* while building the first public HTTP surface

## Context

- **Visuals:** None — interaction model from personal-assistant-docs
- **References:** tree/notes/schedule/planning lib modules; weekly planning wizard spec; personal-assistant-docs `ai/manifest.yaml` + `WARP.md`; Grok/Claude skill layout
- **Product alignment:** Roadmap Phase 3 AI near-term; free-tier stack; multi-user seams preserved via userId

## Standards Applied

- development/testing — lib logic + integration tests + cross-user
- api/response-format, api/error-handling, api/agent-auth, api/agent-tools (new)
