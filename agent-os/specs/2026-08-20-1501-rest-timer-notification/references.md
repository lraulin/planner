# References for rest timer notification

## Governing specs

### `agent-os/specs/2026-07-30-1240-fitness-strength-log/`

- **Relationship:** Extends. Nothing superseded.
- **Relevant decisions:** Changes-from-plan row 11 introduced the sticky rest timer
  (presets 1–3m, ±15, **beep**). The beep and the later tab-title rewrite are the cues this
  spec adds a banner beside, not instead of.

### `agent-os/specs/2026-08-20-1233-exercise-groups/`

- **Relationship:** Extends. Nothing superseded.
- **Relevant decisions:** `+ Add round` calls `start(seconds?)` through `onRegisterStart`.
  Permission is requested from `start()`, so auto-start is the same user-gesture path as
  tapping Start. Group rest is an override of duration, not a second timer.

### `agent-os/specs/2026-08-20-1115-timed-isometric-exercises/`

- **Relationship:** Context only — its “no beep, no tab title” for the hold stopwatch is
  left alone. A hold has no end to announce, and prescribed targets stay deferred.

## Similar implementations

### Rest timer (the thing we extend)

- **Location:** `src/components/fitness/RestTimer.tsx`, `src/lib/fitness/restTimer.ts`
- **Relevance:** Clock math is already pure and in lib; the component owns wall-clock
  `endsAt`, the 200ms tick, `doneFired`, `playDoneBeep()`, and `document.title`. The banner
  belongs next to the beep in that same `doneFired` block.
- **Key patterns:** Side effects are best-effort (`try/catch`, never break the log).
  `start()` is the one entry point, including the group auto-start.

### PWA install surface (not a notification stack)

- **Location:** `src/app/manifest.ts`, `src/proxy.ts` matcher excluding `sw.js`
- **Relevance:** The app is installable (icons, standalone display). There is **no**
  service worker. This spec does not add one; iOS banners still need the Home Screen app
  because Safari-in-a-tab will not show them.

### No existing Notification usage

- A repo search for the Web Notification API finds nothing in `src/`. Do not invent a
  second helper in `src/lib/` outside fitness.
