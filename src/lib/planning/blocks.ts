import { atMinutes, minutesOfDay } from "@/lib/schedule/geometry";

/**
 * Step 5 of the wizard: turning a week's commitments into blocks on the calendar.
 *
 * Achieve gives you a Block Size dropdown, an "Avoid Collisions" toggle, and a Time
 * Remaining readout that ticks down as you drop. All three are arithmetic over intervals,
 * which is exactly the kind of thing that looks right and is off by one slot — so it lives
 * here rather than inside the drag handler.
 */

export type Interval = { start: Date; end: Date };

export function overlaps(a: Interval, b: Interval): boolean {
  // Touching ends do not overlap: a block ending at 10:00 may butt against one starting there.
  return a.start < b.end && b.start < a.end;
}

/** Sorted, non-overlapping union of the input. Touching intervals are merged. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals]
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const merged: Interval[] = [];
  for (const next of sorted) {
    const last = merged[merged.length - 1];
    if (last && next.start <= last.end) {
      if (next.end > last.end) last.end = next.end;
      continue;
    }
    merged.push({ start: new Date(next.start), end: new Date(next.end) });
  }
  return merged;
}

/**
 * The first start at or after `desiredStart` where a block of `durationMinutes` fits
 * without touching anything in `busy`, or null if none does before `searchEnd`.
 *
 * Candidates advance to the end of whatever blocked them, then snap up to the grid, so the
 * result lands on a slot the calendar can render rather than at 10:07.
 */
export function findFreeSlot(
  busy: Interval[],
  desiredStart: Date,
  durationMinutes: number,
  options: { searchEnd: Date; stepMinutes?: number },
): Date | null {
  const step = options.stepMinutes ?? 15;
  const durationMs = durationMinutes * 60_000;
  const merged = mergeIntervals(busy);

  let candidate = new Date(desiredStart);
  // Each iteration jumps past one blocking interval, so the merged list bounds the loop.
  for (let guard = 0; guard <= merged.length; guard += 1) {
    const end = new Date(candidate.getTime() + durationMs);
    if (end > options.searchEnd) return null;

    const blocker = merged.find((b) => overlaps({ start: candidate, end }, b));
    if (!blocker) return candidate;

    candidate = snapUp(blocker.end, step);
  }
  return null;
}

/** Round a time forward to the next `step`-minute boundary of its own local day. */
export function snapUp(date: Date, step: number): Date {
  if (step <= 0) return new Date(date);
  const minutes = minutesOfDay(date);
  const hasSeconds = date.getSeconds() > 0 || date.getMilliseconds() > 0;
  const snapped = Math.ceil((minutes + (hasSeconds ? 1 : 0)) / step) * step;
  // atMinutes handles the day rollover for us when snapping past midnight.
  return atMinutes(date, snapped);
}

/**
 * How Achieve slices a commitment into droppable blocks: whole blocks of `blockSize`, then
 * whatever is left. A tail shorter than `minTailMinutes` is folded into the previous block
 * rather than left as a 5-minute stub nobody would schedule.
 */
export function splitIntoBlocks(
  totalMinutes: number,
  blockSizeMinutes: number,
  minTailMinutes = 15,
): number[] {
  if (totalMinutes <= 0 || blockSizeMinutes <= 0) return [];
  if (totalMinutes <= blockSizeMinutes) return [totalMinutes];

  const whole = Math.floor(totalMinutes / blockSizeMinutes);
  const tail = totalMinutes - whole * blockSizeMinutes;
  const blocks = Array.from({ length: whole }, () => blockSizeMinutes);

  if (tail === 0) return blocks;
  if (tail < minTailMinutes) {
    blocks[blocks.length - 1] += tail;
    return blocks;
  }
  return [...blocks, tail];
}

/** Minutes already blocked out on the calendar for one project. */
export function scheduledMinutesForProject(
  blocks: { projectId: string | null; startAt: Date; endAt: Date }[],
  projectId: string,
): number {
  return blocks
    .filter((b) => b.projectId === projectId)
    .reduce(
      (total, b) =>
        total + Math.max(0, b.endAt.getTime() - b.startAt.getTime()) / 60_000,
      0,
    );
}

/**
 * Achieve's "Time Remaining": what a project still owes the week after the blocks already
 * on the calendar. Negative when you have over-scheduled it, which is worth showing rather
 * than clamping — it is the same mistake as over-committing, one level down.
 */
export function remainingMinutesForProject(
  committedMinutes: number | null,
  scheduledMinutes: number,
): number | null {
  if (committedMinutes == null) return null;
  return committedMinutes - scheduledMinutes;
}

/** The next block to drop for a project: its block size, trimmed to what it still owes. */
export function nextBlockSize(
  remainingMinutes: number | null,
  blockSizeMinutes: number,
): number {
  if (remainingMinutes == null) return blockSizeMinutes;
  if (remainingMinutes <= 0) return blockSizeMinutes;
  return Math.min(blockSizeMinutes, remainingMinutes);
}
