# API error handling

## Error codes

| Code           | HTTP | When                                      |
| -------------- | ---- | ----------------------------------------- |
| `unauthorized` | 401  | Missing/invalid API key or future session |
| `validation`   | 400  | Bad or incomplete arguments; illegal nest |
| `not_found`    | 404  | Id does not exist **for this user**       |
| `conflict`     | 409  | Reserved for true conflicts (rare in MVP) |
| `internal`     | 500  | Unexpected failure; missing server config |

Map domain throws carefully:

- Messages like “not found” / “Item not found” / “Note not found.” → `not_found`
- Hierarchy / range / type errors → `validation`
- Unknown throw → `internal` with a safe message

## Invariants

- A missing id for another user’s row must look like **not found**, not forbidden with a
  different shape — never confirm that a foreign id exists.
- Validation errors should name the field when practical (`"parentId is required for task"`).
