/**
 * A single haptic tick, where the device has one.
 *
 * Guarded twice over because this runs during a gesture on every device the app opens on:
 * `navigator` is absent during SSR, and iOS Safari — the platform this app is most often a
 * PWA on — implements no `vibrate` at all. Both are silent no-ops rather than a feature
 * check the caller has to remember, so a gesture is never written twice.
 *
 * Durations here are deliberately at the bottom of what a phone can render. A tick that
 * confirms a threshold has been crossed should be felt and not noticed; anything longer
 * reads as the device buzzing at you.
 */
export function haptic(ms = 10): void {
  if (typeof navigator === "undefined") return;
  navigator.vibrate?.(ms);
}
