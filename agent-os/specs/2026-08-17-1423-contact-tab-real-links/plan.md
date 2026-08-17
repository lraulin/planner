# Contacts tab links to real contacts

**Status: frozen / complete** (2026-08-17)  
Spec folder: `agent-os/specs/2026-08-17-1423-contact-tab-real-links/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-07-27-1318-per-type-detail-forms/` — Project and Task Contacts tabs, `node_items` kind `contact`, `ItemList`
- **Extends:** `agent-os/specs/2026-08-05-1458-remaining-go-menu-modules/` — the real `contacts` table, `loadContactOptions` / `displayNameOf`, `assertContactOwned`
- **Supersedes:** `agent-os/specs/2026-08-05-1458-remaining-go-menu-modules/` — the decision that `node_items` kind `"contact"` stays a separate planning list and is not the address book

## Context

The Project and Task drawers still have a Contacts tab whose rows are free-text `node_items`: `title` (Name), `association`, and a text `contact` field labeled "Contact details". Achieve's third column was "Contact record for the contact (if any)". When the real Contacts module shipped, that list was deliberately left as a brainstorming pad.

A contact on this tab is now a **link to a person in Contacts**. The name is that person's display name. Association stays as the project- or task-specific note. This is an intentional improvement on Achieve, which allowed a typed name with no record.

Visuals: Achieve Project Contacts screenshots already in `agent-os/specs/2026-07-27-1318-per-type-detail-forms/visuals/project_form/` (Name / Association / Contact=None). No new mockups.

## Decisions

- **Row = link + association.** Keep `node_items` kind `contact` for order and the Association note. Add nullable `node_items.contact_id` → `contacts.id`. Do not invent a second join table.
- **Name is derived.** Never type a name on the item. Display `displayNameOf` from the linked contact. Do not copy the name into `title` (it would go stale).
- **Columns:** Name (derived) | Association. Drop the third "Contact details" column — Name _is_ the contact. Editor: contact picker + Association.
- **Insert still creates a row**, then expands with the picker focused. Empty Name reads as a prompt to pick. Creating a new address-book person stays on `/contacts`.
- **One person per node.** Partial unique on `(userId, nodeId, contactId)` where `kind = 'contact'` and `contactId` is not null. Duplicate pick fails with a clear error. Multiple unlinked (null) rows are allowed so Insert is not blocked.
- **Deleting a contact removes the link row** (`onDelete: "cascade"`). The row exists only as a link, unlike discussion tasks / notes / resources, which keep the work and `set null`.
- **Ownership.** `createNodeItem` / `updateNodeItem` / `importNodeItems` prove the contact belongs to the same `userId` before writing, same as `assertContactOwned` in resources.
- **Existing rows.** Leave leftover `title` / text `contact` values alone. `contactId` starts null; the user re-picks. No automatic name matching.
- **Leave the unused text `contact` column.** Stop writing it for this kind. Dropping it is a later cleanup, not this spec.
- **No nested contact drawer** from the item row. Edit the person on `/contacts`.
- **CSV Name is the display name.** Export writes names, not UUIDs. Import resolves names through `loadContactOptions` and errors on unknown names; it never creates contacts.
- **Third picker caller extracts `ContactSelect`.** `TaskContactPanel` and `ResourceDrawer` already duplicate a `<select>` over `ContactOption[]`. ItemList is the third caller — one shared control.

## Out of scope

- Creating a contact from the Project/Task Contacts tab
- Opening the contact drawer from inside the node drawer
- Goal form (no Contacts tab)
- Stakeholders, Roles, or other person-shaped text fields
- Dropping the unused `node_items.contact` text column
- Changing discussion-item `task_details.contactId` (different meaning)

## Acceptance criteria

- [x] Project and Task Contacts tabs show Name (from the linked person) and Association
- [x] Insert → pick an existing contact → Name updates to that person's display name; Association saves on the item
- [x] The same contact cannot be added twice on one node
- [x] A second user cannot attach the first user's contact, or edit/delete the first user's row
- [x] Deleting a contact removes that person's rows from every node's Contacts tab
- [x] Renaming a contact in Contacts updates the Name on the next drawer open (no stored copy)
- [x] CSV export uses display names; import of an unknown name fails that row
- [x] Existing free-text rows still appear (Name empty / "Pick a contact") until re-linked

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change                                                                 | Why                                              |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------ |
| 1   | Picker omits people already on the same node's list (except this row). | Makes the unique constraint visible before save. |

## Task 1: Save Spec Documentation

Create this folder with `plan.md`, `shape.md`, `standards.md`, `references.md`. Status: active.

While this spec is **active**, when we make a material change to requirements, design,
or scope (including from feedback on what was implemented), update the relevant sections
and append to **Changes from original plan**. Skip pure implementation details. Freeze
when verified.

## Task 2: Schema

In `src/db/schema.ts` on `node_items`:

- `contactId` uuid, nullable, references `contacts.id` `onDelete: "cascade"`
- index `(userId, contactId)` for the delete path
- partial unique `(userId, nodeId, contactId)` where `kind = 'contact'` and `contactId` is not null

`npm run db:generate`, read the SQL, `npm run db:migrate`. Commit SQL + snapshot + journal together.

Update the `node_items` / Contact-kind comments: Name is no longer stored on `title`; the row is a link.

## Task 3: Mutations and queries

- Add `contactId` to `ITEM_KEYS` in `src/lib/detail/mutations.ts`
- Before write, `assertContactOwned` (extract or share the resources helper — one implementation)
- Unique-violation → a readable "already on this list" error
- `loadNodeDetail` stays on `node_items`; names are looked up client-side from `loadContactOptions` (already the single place display names are derived)
- Integration tests in `src/lib/detail/mutations.integration.test.ts`:
  - owner can link a contact and persist association
  - other user's contact is rejected
  - other user cannot read/change/delete the item
  - same contact twice on one node fails
  - deleting the contact removes the item
  - linking does not write `title`

## Task 4: Item kind config, sort, CSV

- `ITEM_KINDS.contact`: columns `["contactId", "association"]`; fields = contact picker + association
- Add `contact` to `ItemFieldKind`; add `contactId` to `ItemColumnKey` / `COLUMN_LABELS` ("Name")
- Update `itemKinds.test.ts` (Name label moves from `title` to `contactId`)
- Sort the Name column by display name, not UUID (`itemSort` needs the name map or a comparable value)
- CSV: `itemsToCsv` writes display name for a contact field; parse keeps the name string; import path resolves names → `contactId` and reports unknown names as row errors. Unit tests for both directions

## Task 5: UI

- Extract `src/components/contacts/ContactSelect.tsx` from `TaskContactPanel` and `ResourceDrawer`
- `ItemList` loads options (or receives them) when `kind === "contact"`; Name cell looks up `contactId`; empty shows a pick prompt; editor uses `ContactSelect`
- Insert still uses the existing create action; expand the new row so the picker is the first thing you do
- Do not open the contact drawer from the row

## Task 6: Verify, freeze spec, update roadmap

Verified 2026-08-17:

- Unit tests for item kinds, CSV name export/resolve, and name-based sort
- Detail integration tests against Postgres (50 passed, including the new contact-link cases; did not skip)
- Browser: Project Contacts tab insert → pick Johnny Yuel → Association persists across reopen; Task Contacts tab the same; rename to Jonathan updates the project tab Name without a stored copy (then restored)
- No `src/app/**` change, so no smoke
- Not a roadmap item — no roadmap edit

### Follow-ups (new work — not amendments to this frozen spec)

- Drop the unused `node_items.contact` text column
- Create a contact from this tab
- Open the contact drawer from a linked row (without stacking drawers)
