# Standards for Deep links for the four remaining kinds

The following standards apply to this work. Full text lives at the paths below; the
notes are what this spec actually leans on.

## @agent-os/standards/components/drawer-pattern.md

A full-record edit is a right-sliding drawer. Open and close reset together. Back
closes because the open drawer is a `push` on `?detail=`. Appointments and Metrics
follow this. Timeline and Commitments have no drawer — they edit in the grid — so
`?detail=` there is a landing, not a form.

## @agent-os/standards/components/navigation.md

A command that cannot do what it says is disabled with a reason, or labelled honestly.
Find currently says **Show where it lives** for these four because it cannot open them.
After this spec it says **Open** and opens.

## @agent-os/standards/development/testing.md

Pure mapping (`resultTarget`) is tested beside the module. React views are not. No
new database surface, so no integration test.

## @agent-os/standards/development/clean-code.md

There is one of each thing. The open record lives in `?detail=` via `useViewStateUrl`,
the same hook Contacts and the Register use. Do not invent `?open=` or a second
calendar date param — the calendar already has `?start=`.

## @agent-os/standards/development/commits.md

One logical change. Effect-naming subject. Spec trailer pointing at this folder.
