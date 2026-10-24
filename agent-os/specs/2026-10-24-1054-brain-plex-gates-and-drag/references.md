# References for Brain plex: gates, curved links, drag to create and connect

## Governing specs

### `agent-os/specs/2026-10-24-0925-brain-library-page/`

- **Relationship:** Extends; supersedes "plex drag-to-link" out-of-scope, boxed-chip/straight-line
  rendering, and "siblings carry no line".
- **Relevant decisions:** one link per pair with in-place relink; `LinkRelation` reading
  (change 4); `AddLinkInput` autocomplete avoids duplicates; edges fade rather than slide
  (change 8); mobile fallback.

## Similar Implementations

### Pointer-drag precedent

- **Location:** `src/components/schedule/WeekCalendar.tsx`
- **Relevance:** pointer events with capture, no drag library.

### Current plex

- **Location:** `src/components/brain/Plex.tsx`, `ThoughtChip.tsx`, `src/lib/brain/plex.ts`
- **Relevance:** disjoint-zone layout and keyed absolute positioning stay; edges and chip look change.

### Mutations already present

- **Location:** `src/lib/brain/mutations.ts` (`linkThoughts`, `createThought` with `linkTo`),
  `src/app/(shell)/library/brain/actions.ts`
- **Relevance:** no server changes needed beyond gate flags in `loadPlex`.

### TheBrain screenshots

- **Location:** `visuals/`
