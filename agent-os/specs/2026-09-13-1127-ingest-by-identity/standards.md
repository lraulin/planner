# Standards for ingest by identity, not by date

**Status: active**

Applied as of standards commit `c06db72a35f9ae6e2e23203fe89596fee3536759`. References, not
copies — see AGENTS.md.

- `agent-os/standards/development/clean-code.md` — "when the model is wrong, change the model":
  the watermark is the wrong concept (date coverage standing in for delivery), so it is deleted
  rather than guarded. Pairing, lost-hold carry and the tiebreak live as small pure modules in
  `src/lib/finances/`; `userId` on every mutation.
- `agent-os/standards/development/testing.md` — pairing, the lost-hold rule, the sync anchor and
  the same-day tiebreak are pure and get unit tests that fail on the observed mistakes
  (ChatGPT/Claude, Sep 10 partial delivery). Retirement, snapshot apply and sync writes get
  `*.integration.test.ts` with a second user.
- `agent-os/standards/development/dates.md` — posted/transaction dates are calendar days; the
  sync anchor reduces SimpleFIN's `balance-date` instant with `toDateKey`, and the tiebreak
  compares day keys, never `startOfDay`.
- `agent-os/standards/development/security.md` — every retirement, carry and insert proves
  ownership by `userId` before writing.
- `agent-os/standards/development/commits.md` — one logical change per commit, root cause in the
  body, `Spec:` trailer.

## Deviations

None.
