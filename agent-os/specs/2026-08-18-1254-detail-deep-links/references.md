# References for Deep links for the four remaining kinds

## Governing specs

### `agent-os/specs/2026-08-18-1012-advanced-find/`

- **Relationship:** Extends — this is the frozen spec's first follow-up.
- **Relevant decisions:** `resultTarget` already maps every kind; four kinds report
  `opens: false` because the destination views do not consume `?detail=`. Decision 8
  already wrote the intended hrefs (`/metrics?detail=`, `/finances/commitments?detail=`,
  `/schedule/calendar?date=…&detail=`). This spec keeps those hrefs except the calendar
  day param, which must be `?start=` — the name Decision 8 guessed was wrong.

### `agent-os/specs/2026-07-31-1520-persistent-ui-state/`

- **Relationship:** Extends.
- **Relevant decisions:** URL holds drawers and sub-view. `?detail=` means the form is
  open. Filters stay in `user_settings`.

### `agent-os/specs/2026-08-14-1142-view-in-outline/`

- **Relationship:** Extends.
- **Relevant decisions:** `?select=` is "this is the selected Outline row"; `?detail=`
  is "the form is open." Do not reuse `?select=` on Timeline or Commitments.

## Similar implementations

### Contacts / Resources / Register / Accounts

- **Location:** `src/components/contacts/ContactsView.tsx`,
  `src/components/resources/ResourcesView.tsx`,
  `src/components/finances/FinancesView.tsx`,
  `src/components/finances/accounts/AccountsView.tsx`
- **Relevance:** `const { detail: openId, setDetail: setOpenId } = useViewStateUrl()`.
  The drawer takes the id; the URL is the only source of truth.
- **Key patterns:** `openDrawer` is `setOpenId`; `closeDrawer` is `setOpenId(null)`
  plus a list refresh. Page wrapped in `<Suspense>` because `useSearchParams` suspends.

### `useGridTab`

- **Location:** `src/components/tabs/useGridTab.ts`
- **Relevance:** Syncs the row highlight from `?detail=` during render so the open
  drawer has a selected owner without an effect cascade.

### Schedule range

- **Location:** `src/app/schedule/rangePage.tsx`
- **Relevance:** The visible range is anchored on `?start=` (legacy `?week=` still
  resolved). `?date=` is a Notes / Day param and is ignored here.

### Timeline row ids

- **Location:** `src/lib/timeline/chronology.ts`
- **Relevance:** Life-event rows are `event:<uuid>`. Find's `recordId` is the bare
  uuid. The view prefixes when selecting.

### Find targets

- **Location:** `src/lib/find/targets.ts`
- **Relevance:** The only code Find needs once the views consume the param. `opens`
  drives the command label in `FindResults`.
