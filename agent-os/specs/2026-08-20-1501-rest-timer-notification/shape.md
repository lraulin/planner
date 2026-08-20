# Rest timer notification — Shaping Notes

**Status: frozen / complete** (2026-08-20)

## Scope

When the Fitness rest countdown hits 0:00, fire an OS notification on top of the beep and
tab title that already exist.

### Out of scope

- Screen wake lock (offered during shaping, declined)
- Service worker / Web Push
- Vibration
- Hold / isometric notify (a count-up has no end; timed-isometric spec deferred targets)
- Pomodoro or any shared notification helper
- A Notify toggle or settings row
- Changing `MIN_REST_SEC`

## Decisions

- **Rest countdown only.** It is the only timer that ends.
- **OS banner + keep beep and tab title.** Not a louder-beep-only change, and not a
  replacement for the existing cues.
- **Permission on first Start.** Browser `Notification.permission` is the memory. No
  localStorage flag, no settings chrome.
- **Fitness-only.** `src/lib/fitness/restNotify.ts` — not a product-wide notify bus. The
  roadmap Pomodoro timer can grow its own later if it needs one.
- **Best-effort.** Same wrapping as `playDoneBeep`. Denied or missing API must not throw.
  iPhone banners require the Home Screen PWA (iOS 16.4+). A sleeping tab may delay the
  banner until the page wakes.
- **Replace, don’t stack.** One `tag` so eight rests do not leave eight banners.

## Context

- **Visuals:** None. The rest strip is unchanged; the banner is OS chrome.
- **References:** `RestTimer.tsx` (beep + tab title), `restTimer.ts` (countdown math),
  founding fitness spec row 11, exercise-groups auto-start of `start()`.
- **Product alignment:** Gap-fill on the delivered Fitness rest timer, not a new tracker
  line and not Pomodoro. Achieve does not govern this.

## Standards Applied

- **development/testing** — permission/copy rules in lib with a sibling test; no component
  tests; no DB
- **development/clean-code** — one concept, no speculative notify bus, side effects stay
  in the component
- **components/ux-principles** — immediate feedback when rest ends
- **components/responsive** — this exists because of the phone at the gym; the strip
  layout does not change
