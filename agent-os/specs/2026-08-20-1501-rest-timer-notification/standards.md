# Standards for rest timer notification

Applied as of standards commit `288bff3`. References, not copies — see AGENTS.md.

- `agent-os/standards/development/testing.md` — Permission/copy rules live in lib with a sibling test. No component tests, no DB.
- `agent-os/standards/development/clean-code.md` — One concept (`restNotify`), no speculative notify bus. Side effects stay in RestTimer.
- `agent-os/standards/components/ux-principles.md` — Immediate, clear feedback when rest ends. No new chrome on the rest strip.
- `agent-os/standards/components/responsive.md` — This exists because of the phone at the gym. The strip layout does not change.

Deviations: none recorded.

<!-- The standards text was formerly inlined here. It lives in agent-os/standards/
     and, as it stood at freeze, in `git show 288bff3:agent-os/standards/<path>.md`. -->
