# Standards applied — RedNotebook import + journal hierarchy

**Status: active**

- **Testing:** pure parse/markup unit tests; import + journal path integration tests with
  second-user isolation. No component tests.
- **Dates:** `noteDate` via `fromDateKey` (UTC noon); compare with `::date` / `toDateKey`.
- **API:** multipart route handler (not Server Action), same rationale as Achieve import.
- **Mutations:** every write takes `userId` and scopes by it.
- **UX:** Settings card matches Achieve transfer panel chrome.
