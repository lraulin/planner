# Standards for Settings workspace and date format preference

**Status: frozen / complete** (2026-08-09)

The following standards apply in full to this work.

## `development/dates`

**Why:** The preference formats calendar-day keys and local calendar projections of true
instants without changing storage or comparison semantics. Calendar fields continue through
`toDateKey`; wall-clock days of instants continue through `localDateKey`; native inputs keep
canonical `YYYY-MM-DD` values.

Source: `agent-os/standards/development/dates.md`

## `development/clean-code`

**Why:** Formatting, parsing, preference grouping, and reset exclusion are pure `src/lib`
logic. Components only wire presentation, actions stay thin, and every database mutation
takes `userId` first.

Source: `agent-os/standards/development/clean-code.md`

## `development/testing`

**Why:** The formatter and management rules require adjacent unit tests. The new batch
mutation requires real Postgres coverage proving requested deletion, preservation, and
second-user read/change/delete isolation. No React component tests are added.

Source: `agent-os/standards/development/testing.md`

## `components/responsive`

**Why:** Settings changes information architecture at `md`, uses `--tap-target` on phone,
keeps inputs at least 16px, honors safe areas and `dvh`, uses an inner scroller, avoids body
horizontal overflow, and is checked at 390×844 and 1280×800 in both schemes.

Source: `agent-os/standards/components/responsive.md`

## `components/ux-principles`

**Why:** Categories and collapsed transfer tools use progressive disclosure. Individual
resets are immediate; wider destructive resets use the shared confirmation surface.

Source: `agent-os/standards/components/ux-principles.md`

## `components/modal-pattern`

**Why:** Module and global reset confirmations use `ConfirmDialog`/`ModalShell`; no bespoke
backdrop or browser confirmation is introduced.

Source: `agent-os/standards/components/modal-pattern.md`
