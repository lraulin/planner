/**
 * Moves this process's JavaScript clock, for `scripts/test-future.mjs`. Loaded with
 * `node --import`, so it reaches every Vitest worker through NODE_OPTIONS.
 *
 * `CLOCK_SHIFT_DAYS=200` moves the clock 200 days forward; `CLOCK_NOW=2026-11-01T14:00:00Z`
 * sets it to an instant. Either way it keeps ticking, so timeouts, `Date.now()` deltas and
 * Postgres connections behave normally. Only `Date` moves: timers are untouched, and the
 * database's own `now()` stays real.
 */
const shiftDays = Number(process.env.CLOCK_SHIFT_DAYS ?? "");
const target = process.env.CLOCK_NOW;

const RealDate = Date;
const offset = target
  ? new RealDate(target).getTime() - RealDate.now()
  : Number.isFinite(shiftDays)
    ? shiftDays * 86_400_000
    : 0;

if (Number.isNaN(offset)) {
  throw new Error(`shift-clock: CLOCK_NOW is not a date: ${target}`);
}

if (offset !== 0) {
  class ShiftedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(RealDate.now() + offset);
      else super(...args);
    }

    static now() {
      return RealDate.now() + offset;
    }
  }
  globalThis.Date = ShiftedDate;
}
