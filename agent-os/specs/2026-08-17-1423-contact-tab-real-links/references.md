# References for Contacts tab links to real contacts

## Governing specs

### `agent-os/specs/2026-07-27-1318-per-type-detail-forms/`

- **Relationship:** Extends — the Contacts tab, `node_items` kind `contact`, `ItemList`
- **Relevant decisions that carry forward:** one `node_items` table; rows expand in place;
  Issues' Summary and Contacts' Name originally mapped onto `title`
- **What this changes:** the contact row is no longer a free-text name + "Contact details"

### `agent-os/specs/2026-08-05-1458-remaining-go-menu-modules/`

- **Relationship:** Extends the real `contacts` table and `loadContactOptions`;
  **supersedes** the decision that `node_items` kind `"contact"` stays a separate
  goal-planning list and is not the address book
- **Relevant decisions that carry forward:** display names are derived (`displayNameOf`);
  discussion items stay `task_details.contactId` (`set null`); deleting a contact never
  deletes _work_
- **What this replaces:** "the planning list stays exactly as it is"

## Similar implementations

### Resource and task contact pickers

- **Location:** `src/components/resources/ResourceDrawer.tsx`,
  `src/components/contacts/TaskContactPanel.tsx`, `src/lib/contacts/queries.ts`
  `loadContactOptions`
- **Relevance:** the existing `<select>` over `ContactOption[]`. ItemList is the third
  caller, so extract `ContactSelect`.
- **Key patterns:** `(none)` empty option; display name from `displayNameOf`

### Resource contact ownership

- **Location:** `src/lib/resources/mutations.ts` `assertContactOwned`
- **Relevance:** prove the contact belongs to `userId` before writing the FK. Share this
  helper rather than copying it.

### Item list config

- **Location:** `src/lib/detail/itemKinds.ts`, `src/components/detail/ItemList.tsx`,
  `src/lib/detail/itemCsv.ts`
- **Relevance:** columns, editor fields, CSV, and sort all come from the kind config.

### Achieve Project Contacts tab

- **Location:** `docs/achieve-planner/online-help.md` (Name, Association, Contact record);
  screenshots in `agent-os/specs/2026-07-27-1318-per-type-detail-forms/visuals/project_form/`
- **Relevance:** Association stays; Name becomes the linked person; the third column is
  dropped because it would duplicate Name.
