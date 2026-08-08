# References

**Status: frozen / complete** (2026-08-07)

| Path                                                 | Why                                               |
| ---------------------------------------------------- | ------------------------------------------------- |
| `src/lib/rednotebook/**`                             | Closest import, mapping and idempotence precedent |
| `src/app/api/rednotebook/import/route.ts`            | Multipart multi-file limits and warning cap       |
| `src/components/settings/RedNotebookImportPanel.tsx` | Existing Settings import interaction              |
| `src/lib/notes/mutations.ts`                         | Root-note ordering and user-scoped writes         |
| `src/db/schema.ts` → `notes`                         | Destination model and note-date semantics         |
| `agent-os/standards/api/response-format.md`          | Current HTTP response envelope                    |
| `agent-os/standards/database/migrations.md`          | Generated migration workflow                      |
| Supplied `Dropbox/AppDocuments/tomboy/0/0/*.note`    | Real Tomboy 0.3 XML corpus                        |
