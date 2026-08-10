# Settings workspace and date format preference

**Status: frozen / complete** (2026-08-09)
Spec folder: `agent-os/specs/2026-08-09-1956-settings-workspace-date-format/`

This is the as-built record. Future changes to Settings or date-display policy should use
this folder as context and open a new delta-spec rather than editing this frozen spec.

## Context

Settings is currently a flat reset list followed by unrelated connection and transfer
panels. Account identity and sign-out live in the route header, which makes the page harder
to scan and does not adapt into a useful phone information architecture.

Standalone calendar days also use `formatShortDate`, which hard-codes `m/d/yy`. That helper
combines a formatting policy with date rendering, so every grid and supporting surface
inherits a two-digit year with no user-level choice. Achieve's compatible default is
`M/D/YYYY`.

## Decisions

- Settings is a responsive category workspace with **General**, **Views & layout**,
  **Connections**, **Import & export**, and **Account**.
- Desktop uses a Planner-style index rail; compact layouts use a 44px category selector.
  Category state is `?section=` with `general` as the fallback, and changes replace history.
- The header contains only **Back to Planner / Settings**. Account identity, development
  bypass context, and Sign out move into Account.
- A singleton `display` settings scope stores defensive `DisplaySettings { dateFormat }`
  data in `user_settings`; no schema migration is required.
- The date preset catalogue is English and deterministic. Invalid stored formats fall back
  to `M/D/YYYY`; malformed calendar keys render blank.
- A context-derived `useDateFormatter()` reads the server-loaded per-user snapshot. No
  mutable module-level date policy is used during SSR.
- Canonical `YYYY-MM-DD` keys remain the representation for storage, native date inputs,
  filtering, sorting, and comparisons. Only standalone display text changes.
- The preference applies to grid and compact-row dates, date filter labels, note date
  groups, linked records, contact deadlines, fitness performance days, and metric point
  tooltips. Purpose-specific headings, ranges, mini-months, chart axes, timestamps, and
  planning prose retain their contextual formats.
- Long formats keep existing column widths and truncate; exact full dates are available by
  tooltip. Partial formats also reveal the full date on hover.
- Google remains functionally unchanged under Connections. Achieve, RedNotebook, and
  Tomboy transfers remain functionally unchanged inside initially collapsed disclosures.
- Reset management derives module and view groups from the whole settings snapshot. Saved
  view names come from `views:*` catalogues, known settings do not expose raw scope IDs, and
  unknown legacy scopes remain resettable under Other.
- Module and global resets are confirmed and execute one user-scoped database delete.
  `views:*` catalogues and scopes owned by saved-view IDs survive bulk resets. Saved-view
  scopes remain visibly marked and individually resettable.

## Date format catalogue

Numeric: `M/D/YYYY`, `M/D/YY`, `MM/DD/YYYY`, `MM/DD/YY`, `D/M/YYYY`, `D/M/YY`,
`DD/MM/YYYY`, `DD/MM/YY`, `YYYY-MM-DD`, `YYYY/MM/DD`.

Written: `MMM D, YYYY`, `MMMM D, YYYY`, `D MMM YYYY`, `D MMMM YYYY`, `D-MMM-YY`,
`D-MMM-YYYY`, `DDD, MMM D, YYYY`, `DDDD, MMMM D, YYYY`.

Partial: `M/D`, `MM/DD`, `D/M`, `DD/MM`, `MMM D`, `MMMM D`, `D MMM`, `D-MMM`,
`MMM-YY`, `MMM YYYY`, `MMMM YYYY`, `DDD`, `DDDD`.

## Code map (as built)

| Concern                                       | Location                                                   |
| --------------------------------------------- | ---------------------------------------------------------- |
| Preset catalogue and calendar-key rendering   | `src/lib/dateFormat.ts`                                    |
| Display preference codec                      | `src/lib/settings/display.ts`                              |
| Per-user formatter context                    | `src/components/settings/SettingsProvider.tsx`             |
| Truncating date presentation and full tooltip | `src/components/date/DateText.tsx`                         |
| Settings category workspace                   | `src/components/settings/SettingsPage.tsx`                 |
| Reset grouping and bulk exclusions            | `src/lib/settings/management.ts`                           |
| User-scoped batch delete                      | `src/lib/settings/mutations.ts`                            |
| Settings route/action boundary                | `src/app/settings/page.tsx`, `src/app/settings/actions.ts` |

## Acceptance criteria

- [x] Default standalone dates display four-digit years as `M/D/YYYY`.
- [x] Every documented preset formats `2026-01-05` deterministically in English.
- [x] Leap days work, invalid calendar keys render blank, invalid preferences use the
      Achieve default, and results do not depend on process timezone.
- [x] Changing Date format updates its sample and date displays, autosaves, and survives
      reload/navigation.
- [x] Long and partial values retain layout, truncate where needed, and expose the full date.
- [x] Native date inputs and all date comparison/filter/sort semantics remain canonical.
- [x] Category URLs, desktop rail, mobile selector, internal scrolling, safe areas, dark
      mode, and 44px compact controls behave as specified.
- [x] Connections, transfers, account actions, and existing confirmations retain behavior.
- [x] Preference groups use module and actual saved-view names; unknown legacy rows remain
      reachable without exposing raw IDs for known rows.
- [x] Individual reset is immediate. Module/global reset uses `ConfirmDialog` and one batch
      mutation while preserving view catalogues and saved-view-owned scopes.
- [x] Unit, real-Postgres integration, lint, typecheck, production build, smoke, and desktop
      and phone browser passes succeed.

## Changes from original plan

| What changed                                                                                                                                                  | Why                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Removed the former unscoped “reset everything” provider/action path; global reset now derives the eligible scope list and uses only the batch reset contract. | Keeping a second delete-all route would bypass the saved-view preservation invariant and make the UI wording the only protection against data loss. |

---

## Task 1: Save spec documentation — done

- Create the active spec, shaping record, standards copy, references, and approved wireframe.

## Task 2: Build the date-format foundation — done

- Replace the hard-coded short-date helper with the typed preset catalogue and calendar-key
  formatter.
- Add the `display` codec/scope, formatter context, selector, live sample, autosave error
  handling, and Restore Achieve default.
- Update the date-handling standard.

## Task 3: Migrate standalone date displays — done

- Convert repeated `formatShortDate` and standalone `toLocaleDateString` sites.
- Thread the format into pure grouping and metric helpers where hooks cannot be used.
- Keep contextual headings, axes, and instant timestamps separate.

## Task 4: Build the Settings workspace — done

- Implement the index rail, compact selector, simplified header, category URL state, account
  panel, connections panel, and collapsed transfer disclosures.

## Task 5: Reorganize reset management — done

- Derive human groups and saved-view labels from the snapshot.
- Add provider/action/database batch reset and confirmation flows with saved-view exclusions.

## Task 6: Verify and freeze — done

- Reconcile material implementation discoveries, run every acceptance gate, update the
  roadmap only if a listed item closes, and freeze the spec.

## Verification

- `npm test`: 160 files and 2,184 tests passed against running Postgres; the 14 settings
  mutation tests ran rather than skipping.
- `npm run lint`, `npm run typecheck`, `npm run format:check`, and `npm run build` passed.
- `npm run smoke`: all 23 application routes rendered from a running development server.
- Browser acceptance passed at 1280×800 and 390×844 across light and dark schemes. The
  selected format updated live, survived reload, changed standalone task dates, retained
  canonical native date-input values, and exposed full dates from partial formats. Settings
  categories, transfer disclosures, account actions, confirmations, 44px phone controls,
  fixed date-column widths, and horizontal overflow were checked.

## Follow-ups (new work — not amendments to this frozen spec)

- Custom date strings and system-locale catalogues remain out of scope.
- Sort and density capture remain deferred in the Views roadmap item.
