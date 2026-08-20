# Rest timer notification

**Status: frozen / complete** (2026-08-20)  
Spec folder: `agent-os/specs/2026-08-20-1501-rest-timer-notification/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-07-30-1240-fitness-strength-log/` — the sticky rest
  countdown (presets, ±15, beep, tab title). Nothing superseded.
- **Extends:** `agent-os/specs/2026-08-20-1233-exercise-groups/` — `+ Add round` already
  calls the same `start()` the banner will hang off. Nothing superseded.

The timed-isometric spec’s “holds have no end to announce” stands. This does not add a
hold notification.

Achieve Planner has no fitness module; `docs/achieve-planner/` does not govern this.

## Context

The rest timer already beeps (Web Audio, 880 Hz, 0.4s) and rewrites `document.title` to
`Rest done · …` at 0:00. That is easy to miss with the phone face-down or another app in
front. There is no `Notification` usage in the app today, and no service worker (the proxy
matcher excludes `sw.js` for a file that does not exist).

This is a Fitness gap-fill, not a product-wide notification system and not the roadmap
Pomodoro timer.

## Decisions

1. **Rest countdown only.** OS banner at 0:00, on top of the existing beep and tab title.
2. **Ask on first Start.** `Notification.requestPermission()` from `start()` — a user
   gesture, including auto-start from `+ Add round`. The browser’s permission string is the
   memory: no settings row, no `localStorage` flag. `default` → ask; `granted` → banner;
   `denied` / missing API → beep and title only.
3. **Best-effort, like the beep.** Wrapped so a missing API or a thrown `Notification`
   never breaks the log. iPhone: banners need the Home Screen PWA (iOS 16.4+). A sleeping
   tab may not fire until the page wakes; wake lock was offered and declined.
4. **Fitness-only helper.** Permission rules and copy live in
   `src/lib/fitness/restNotify.ts`. Do not invent a shared notify bus for Pomodoro.
5. **No service worker, no wake lock, no vibration, no hold-timer notify, no copy change
   to the rest strip.**
6. **Replace, don’t stack.** `tag: "planner-rest-done"`. Title `Rest done`, body
   `Time for the next set.`, icon `/icons/icon-192.png`. Clicking focuses the window and
   closes the banner.

## Acceptance criteria

- [x] The first `Start` (or `+ Add round`) while permission is `default` prompts once
- [x] After **granted**, 0:00 shows an OS banner, the beep still plays, and the tab title
      still becomes `Rest done · …`
- [x] After **denied** or when `Notification` is missing: no throw, beep and title still
      work
- [x] A later rest replaces the previous banner rather than piling up
- [x] Hold stopwatch is unchanged
- [x] Permission/copy rules live in `src/lib/fitness/` with a unit test; no React component
      tests; no DB

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change                     | Why |
| --- | -------------------------- | --- |
|     | _(none — built as shaped)_ |     |

## Task 1: Save Spec Documentation

Create this folder with `plan.md` (Status: active), `shape.md`, `standards.md` (full text
of the four standards), `references.md`. No `visuals/`.

While this spec is **active**, when we make a material change to requirements, design, or
scope (including from feedback on what was implemented), update the relevant sections and
append to **Changes from original plan**. Skip pure implementation details. Freeze when
verified.

## Task 2: Permission rules in lib

Add `src/lib/fitness/restNotify.ts` + `restNotify.test.ts`:

- Map missing API → `unsupported`; otherwise use `Notification.permission`
- `shouldRequestPermission` is true only for `default`
- `shouldShowBanner` is true only for `granted`
- Stable payload: title, body, tag, icon as above

A test that would fail if someone requested on every tick, notified while denied, or
treated missing `Notification` as granted.

## Task 3: Fire it from RestTimer

In `src/components/fitness/RestTimer.tsx`:

- `start()`: if `shouldRequestPermission`, `void Notification.requestPermission()` (ignore
  the promise; the next rest will see the answer)
- The existing `doneFired` block: keep `playDoneBeep()`; if `shouldShowBanner`,
  `new Notification(...)` with the lib payload, `onclick` → `window.focus()` + `close()`.
  Catch like the beep.

No UI chrome on the rest strip. No new settings.

## Task 4: Verify, freeze spec, update roadmap

- Grant path: start a 15s rest (the minimum), allow notifications, confirm banner + beep +
  tab title.
- Deny / dismiss path: beep and title still work, no exception.
- `+ Add round` still starts the timer; if permission is still `default`, that Start is
  what prompts.
- Hold timer does not notify.
- Update plan/shape for any as-built drift; complete **Changes from original plan**.
- Mark **Status: frozen / complete** (2026-08-20).
- Add a short `✅` note under Fitness in `agent-os/product/roadmap.md` — this is a gap-fill
  on the existing rest timer, not a new tracker line.
- Commit and push (one logical change; Spec trailer pointing at this folder).

## Follow-ups (new work — not amendments to this frozen spec)

- Screen wake lock while rest is running, so a sleeping phone still fires at 0:00. Offered
  during shaping and declined.
- Pomodoro (roadmap, not Fitness) will want its own end-of-timer cue. Do not grow
  `restNotify.ts` into a shared bus for it.
