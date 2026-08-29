# Standards for Export timestamps and Activity evidence export

Applied as of standards commit `b48a3649baaa98c551b6ee2aac18d0d0166ac322`. References, not
copies — `git show b48a364:agent-os/standards/<path>` recovers exactly what applied here.

- `agent-os/standards/development/dates.md` — export time is an instant, not a calendar day.
  Do not reuse UTC-noon helpers, and do not keep Achieve's `toISOString().slice(0, 10)`
  filename. Tests pin a `Date` rather than the machine clock.
- `agent-os/standards/development/clean-code.md` — one stamp implementation; the three
  Blob+slug copies are the duplication this removes. Serializers stay in `src/lib/**`;
  components only pass `new Date()` and call `downloadTextFile` / `writeClipboardText`.
- `agent-os/standards/development/testing.md` — stamp spelling, envelope/preamble, Activity
  document contents, parser skip, and Achieve comment placement are pure logic where a wrong
  answer looks plausible. Sibling `*.test.ts`. No React component tests. Nothing here
  mutates the database, so no integration test is owed unless a mutation actually changes.
- `agent-os/standards/components/navigation.md` — File is the catalog; unavailable is
  disabled with a specific reason ("Open an Activity entry first"), never absent; a command
  without a menu is not shipped. `"Export Event"` / `"Copy Event to Clipboard"` join
  `NESTED_SECTIONS` as declared families, not a length-derived fold.
- `agent-os/standards/components/data-grid.md` — export stays menu-only, not a toolbar verb.
  The Activity list keeps using `DataGrid`'s existing File ▸ Export; the event family is a
  second catalog, not a row action or icon.
- `agent-os/standards/components/drawer-pattern.md` — Activity drawer stays read-only
  evidence. Do not invent a footer of export buttons that would duplicate File.
- `agent-os/standards/development/commits.md` — one logical change per commit; Spec trailer
  names this folder.

## Deviations

None. Metrics/ItemList keep their in-form CSV buttons (already shipped); this spec does not
promote them onto File.
