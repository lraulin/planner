# Contacts tab links to real contacts — Shaping Notes

**Status: frozen / complete** (2026-08-17)

## Scope

Make a row on the Project or Task Contacts tab a link to a person in Contacts. The name
comes from that person. Association stays as the project- or task-specific note. No
separate name you type on the item.

### Out of scope

- Creating a contact from this tab
- Opening the contact drawer from inside the node drawer
- Goal form (no Contacts tab)
- Stakeholders, Roles, or other person-shaped text fields
- Dropping the unused `node_items.contact` text column
- Changing discussion-item `task_details.contactId`

## Decisions

- Row stays a `node_items` kind `contact` (order + Association). The person is `contactId`.
- Name is always derived; never copied onto `title`.
- Columns are Name | Association. Achieve's third "Contact record" column is redundant
  once Name _is_ the record — an intentional improvement.
- Insert creates an empty link row, then expands the picker. New people are created on
  `/contacts`.
- One person per node. Deleting the person cascades the link row (the row is the link,
  not independent work).
- Existing free-text rows are left unlinked; the user re-picks. No name matching.
- CSV talks in display names and resolves against the address book; it never creates people.

## Context

- **Visuals:** Achieve Project Contacts shots in
  `agent-os/specs/2026-07-27-1318-per-type-detail-forms/visuals/project_form/`
  (Name / Association / Contact=None). No new mockups.
- **References:** Per-type detail forms (the tab); remaining Go-menu modules (the address
  book, and the decision this supersedes); `loadContactOptions`, ResourceDrawer /
  TaskContactPanel pickers.
- **Product alignment:** Achieve workflow as the foundation, with a deliberate improvement:
  a project/task contact must be a real person. Matches "contacts as first-class address
  book" from the 2026-08-05 module.

## Standards Applied

- development/testing — lib logic + integration tests with a second user
- development/security — `userId` scope and owned `contactId` before write
- database/migrations — generate; SQL + snapshot + journal together
- development/clean-code — one `assertContactOwned`, one `ContactSelect`
- components/ux-principles — expand the row in place; no nested drawer
- components/drawer-pattern — item writes stay on the existing action wrappers
