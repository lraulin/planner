# Standards for Export to clipboard

## components/navigation.md

A command without a `menu` is not shipped. A section in `NESTED_SECTIONS` folds on every surface. Fold value-pickers; keep verb families flat. Unavailable is disabled, not absent.

Option-swap is a pulldown convenience. The permanent Copy to Clipboard family is what satisfies "same tree left open" for people who never hold Option.

## development/testing.md

Pure logic in `src/lib` with a sibling test. No React component tests. Tripwires: alternate labels exist, Copy to Clipboard nests, clipboard text equals the download of that format.

## development/clean-code.md

One clipboard write (`writeClipboardText`). One export snapshot. Do not add a toast stack for a single verb when Copy as text is already silent.
