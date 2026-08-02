# Custom Column Filters — Standards Applied

**Status: active**

Full text of long standards is not duplicated here; agents should read the live files under
`agent-os/standards/`. This feature primarily touches:

| Standard                      | Why                                                                         |
| ----------------------------- | --------------------------------------------------------------------------- |
| `development/testing.md`      | Matching and parse logic must live in `src/lib/**` with tripwire unit tests |
| `components/ux-principles.md` | Modal reserved for blocking config (not record edit) — this qualifies       |
| `components/modal-pattern.md` | `ModalShell`, Escape, focus                                                 |
| `components/responsive.md`    | Bottom sheet below `md` via existing shell                                  |

No database migration. No new API routes.
