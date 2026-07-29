# API response format

All HTTP surfaces under `/api/**` (starting with the agent API) use a single JSON envelope so
clients and coding agents can branch on one field.

## Success

```json
{
  "ok": true,
  "data": {}
}
```

- HTTP status **200** for successful tool calls (including creates).
- `data` is the tool-specific payload. Prefer plain JSON-serializable values: strings, numbers,
  booleans, arrays, objects. Dates are **ISO-8601 strings**.

## Failure

```json
{
  "ok": false,
  "error": {
    "code": "validation",
    "message": "type is required"
  }
}
```

- Always include `code` and a human-readable `message`.
- Do not leak stack traces or internal exception strings that include secrets.

## Content type

- Request bodies: `application/json` (empty object `{}` is fine when a tool has no args).
- Responses: `application/json`.
