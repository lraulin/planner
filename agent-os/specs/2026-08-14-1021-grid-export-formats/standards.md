# Standards for Grid export formats

The following standards apply to this work. Key excerpts, not the full files.

---

## components/navigation.md

A command without a `menu` is not shipped (exception: `group: "go"`). Same label, icon, and
action on every surface.

A section named in `NESTED_SECTIONS` renders as a single row with a fly-out (desktop) or a
drill-in (touch), on **every** surface that shows it. Nesting is declared, not derived from
length. The only length condition is a floor of **two**. Fold families where the name is the
useful thing and the members are a value picker. Do not fold the verbs someone opened the
menu for.

Export is that shape: the name is the verb, CSV / JSON / YAML are the picker.

---

## components/data-grid.md

One shared `DataGrid`. Hierarchy survives as depth in the prepared list. Hosts do not
reimplement grid verbs. A command that belongs on every grid is registered by the grid.

---

## development/testing.md

Pure logic in `src/lib/**` with a sibling `foo.test.ts`. No React component tests. A test
earns its place if it would fail on a plausible mistake — nested vs flat records, YAML
quoting, submenu placement, CSV still a flat table.

---

## development/clean-code.md

`app → components → lib → db`. One implementation per concern: one forest parse, one export
owner. Name the concept. Do not add a YAML library for a document whose values are already
strings.

---

## development/commits.md

One logical change. Imperative subject under 72 characters, not Conventional Commits. Spec
trailer: `Spec: agent-os/specs/2026-08-14-1021-grid-export-formats`. No AI attribution.
