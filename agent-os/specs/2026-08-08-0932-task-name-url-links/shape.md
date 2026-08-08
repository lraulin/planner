# Task name URL → attachment — Shaping Notes

**Status: frozen / complete** (2026-08-08)

## Scope

When a **task** name is written (create with name or rename) and contains web URL(s),
promote each URL to an attachment and replace each URL in the name with the page title
when fetch succeeds — same title source as attachment autofill.

### Out of scope

- Non-task node types
- Notes / description fields
- Client-side live preview while typing
- Bare domain tokens mid-sentence (false-positive risk)
- First-party file storage or non-http schemes

## Decisions

- Tasks only; every name write (create + rename)
- Replace URL substrings with titles; keep surrounding text
- All URLs → attachments; no duplicate attachment for same normalized URL on re-rename
- Fetch failures: still attach; leave URL in name; blank attachment title
- Hook in `createNode` / `renameNode` so capture and agent paths inherit behavior
- Pure extract/rewrite in `src/lib/url/`; promote mutation avoids tree↔detail import cycle
- Whole-name bare hosts only when hostname is multi-label (or localhost) — single words are not URLs

## Context

- **Visuals:** None
- **References:** Attachment URL title autofill (`pageTitle.ts`, `autofillAttachmentTitleFromUrl`)
- **Product alignment:** Small capture-quality improvement on attachments MVP; no roadmap phase change

## Standards Applied

- **development/clean-code** — logic in `src/lib`, thin actions, `userId` on mutations
- **development/testing** — pure unit tests + integration + cross-user
