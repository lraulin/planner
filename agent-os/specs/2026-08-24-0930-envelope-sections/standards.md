# Standards for Envelope sections

## development/clean-code — "When the model is wrong, change the model"

The governing standard for this spec. Two workarounds for one missing concept (a section
decided by a group flag for income, an envelope column for bills, nothing for savings) is
the stated signal that the model, not the code around it, is what needs fixing. "That would
touch a lot of files" is a cost to plan around; ninety-five references to `isIncome` is the
size of the correction, not an argument against it.

## development/testing

Pure logic in `src/lib/**` with a `foo.test.ts` beside it. Anything touching the database
gets a `*.integration.test.ts` that is not done until a second user has failed to read,
change and delete the first user's rows. `npm run test:unit` passing does not mean the
database tests ran — check for the skip warning. A green gate is not proof the app runs:
`npm run smoke` after touching `src/app/**`.

## development/dates

Month keys stay `YYYY-MM-DD` strings; nothing here decides what "today" is.

## database/migrations

Relax a CHECK before rewriting the values it governs. Drizzle-kit's interactive rename
detection needs a TTY this harness does not have — generate additive and destructive passes
separately, or hand-write the SQL.
