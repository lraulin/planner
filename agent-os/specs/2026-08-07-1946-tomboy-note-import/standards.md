# Standards applied — Tomboy note import

**Status: frozen / complete** (2026-08-07)

- **Clean code:** parsing and markup conversion live in small pure `src/lib/tomboy/**`
  modules; the route and component only adapt HTTP and UI concerns.
- **Testing:** pure parser/markup mapping tests plus a real-Postgres import suite, including
  a second user's attempted read, update and delete of the owner's source UUID.
- **Migrations:** schema first, then `npm run db:generate`; commit SQL, snapshot and journal
  together.
- **Dates:** Tomboy create/change values remain true instants. `noteDate` is not inferred.
- **API response format:** `{ ok: true, data }` or `{ ok: false, error: { code, message } }`.
- **Next.js:** a route handler accepts multipart files; the Settings page stays a Server
  Component and the upload interaction stays in a focused Client Component.
- **UX:** match the existing Achieve and RedNotebook Settings card hierarchy and feedback.
