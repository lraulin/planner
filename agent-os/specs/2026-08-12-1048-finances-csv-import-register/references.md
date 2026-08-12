# References

| Path                                                         | Why                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------ |
| `src/lib/csv/text.ts` → `parseCsvRows`                       | RFC-style CSV parse; quoted commas, BOM, CRLF                      |
| `src/lib/metrics/csv.ts` → `parseEntriesCsv`                 | Header mapping + `{ rows, errors[] }` shape                        |
| `src/db/schema.ts` → `metricEntries`                         | Per-user dated numeric rows with provenance                        |
| `src/app/api/rednotebook/import/route.ts`                    | Multipart route handler, size caps, envelope                       |
| `src/components/settings/RedNotebookImportPanel.tsx`         | Import panel chrome and result summary                             |
| `src/lib/rednotebook/{parse,import}.ts`                      | Pure-parse / DB-write split for an importer                        |
| `src/components/resources/ResourcesView.tsx`                 | Flat (non-tree) module on the shared DataGrid                      |
| `src/components/resources/resourcesColumns.tsx`              | `ColumnDef` array for a flat row type                              |
| `src/lib/resources/{queries,mutations}.ts`                   | Query/mutation split, `numeric` ↔ number                           |
| `src/lib/resources/mutations.integration.test.ts`            | Two-user isolation cases                                           |
| `src/lib/db/crossUserReads.integration.test.ts`              | Repo-wide dropped-`userId` sweep to register in                    |
| `src/app/actionResult.ts`                                    | `run` / `runQuery` / `ActionResult`                                |
| `src/components/shell/modules.ts`                            | The only module registry                                           |
| `src/lib/tree/format.ts` → `formatMoney`                     | Existing `$` display for money cells                               |
| `agent-os/specs/2026-08-02-0912-metrics-tab/`                | Closest structural precedent: dated numeric module with CSV import |
| `agent-os/specs/2026-08-03-1518-rednotebook-journal-import/` | Import spec shape and dedup framing                                |
| `agent-os/product/roadmap.md` § Financial planning           | The roadmap item this partially delivers                           |
