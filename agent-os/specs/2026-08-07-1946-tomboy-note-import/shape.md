# Shaping — Tomboy note import

**Status: frozen / complete** (2026-08-07)

## The ask

Bring the Tomboy sync repository at `Dropbox/AppDocuments/tomboy` into Planner Notes.
The repository is a manifest plus versioned `.note` XML files; the note files, not the
manifest, contain the durable user data.

## Scope

Build a reusable Settings import rather than a machine-specific path reader. A browser can
select the repository folder (including its nested `0/0/` directory), and the same importer
can accept a hand-selected set of `.note` files. The supplied local archive is the real-world
verification corpus. Folder selection filters to `.note` files in the browser because this
repository also contains a separate HTML export.

## Mapping rationale

- Tomboy notebooks are many-valued tags, while Planner Subject is singular. Keeping Subject
  as `Tomboy` and placing notebook names in Contexts preserves both source filtering and
  notebook membership.
- Tomboy's create/change dates are instants. Planner `noteDate` means the date a note is
  about, so populating it from creation time would change its meaning.
- The UUID in each filename is stable source identity. Dedicated provenance columns make
  updates safe and avoid visible implementation markers in imported prose.
- A Planner edit newer than Tomboy's last content/metadata change wins on re-import. The
  importer is repeatable archive ingestion, not a destructive restore command.
- Templates configure Tomboy note creation and are not ordinary notes. They are skipped with
  an explicit result count instead of being silently dropped.

## Out of scope

- Treating the filesystem manifest as a live two-way sync protocol
- Deleting Planner notes when source files disappear
- Reconstructing clickable Tomboy internal links before Planner defines wiki-link behavior
- Importing window position, cursor position or open-on-startup state
