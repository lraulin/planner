import { describe, expect, it } from "vitest";
import {
  MAX_VISIBLE_TOASTS,
  SUCCESS_LIFETIME_MS,
  autoExpires,
  dismissToast,
  pauseTimer,
  pushToast,
  resumeTimer,
  startTimer,
  timeLeft,
  type ToastQueue,
} from "./toast";

const make = (id: number) => ({ id, tone: "success" as const, content: `t${id}` });

describe("pushToast", () => {
  it("drops the oldest toast when the cap is exceeded, keeping the newest last", () => {
    let queue: ToastQueue<string> = [];
    for (let id = 1; id <= MAX_VISIBLE_TOASTS + 2; id++) {
      queue = pushToast(queue, make(id));
    }
    expect(queue.map((t) => t.id)).toEqual([3, 4, 5]);
  });

  it("does not mutate the queue it was given", () => {
    const before: ToastQueue<string> = [make(1)];
    pushToast(before, make(2));
    expect(before.map((t) => t.id)).toEqual([1]);
  });
});

describe("dismissToast", () => {
  it("removes only the named toast", () => {
    const queue = [make(1), make(2), make(3)];
    expect(dismissToast(queue, 2).map((t) => t.id)).toEqual([1, 3]);
  });

  it("is a no-op for an id that already dropped", () => {
    const queue = [make(2), make(3)];
    expect(dismissToast(queue, 1)).toBe(queue);
  });
});

describe("autoExpires", () => {
  it("expires success only; warnings and errors wait to be dismissed", () => {
    expect(autoExpires("success")).toBe(true);
    expect(autoExpires("warning")).toBe(false);
    expect(autoExpires("error")).toBe(false);
  });
});

describe("toast timer", () => {
  it("counts down while running", () => {
    const timer = startTimer(1000);
    expect(timeLeft(timer, 1000 + 2500)).toBe(SUCCESS_LIFETIME_MS - 2500);
  });

  it("never reports negative time once past the deadline", () => {
    expect(timeLeft(startTimer(0), SUCCESS_LIFETIME_MS * 3)).toBe(0);
  });

  it("keeps the remaining time across a pause instead of resetting it", () => {
    const paused = pauseTimer(startTimer(0), 4000);
    // Hover for a long while: nothing is consumed.
    expect(timeLeft(paused, 60_000)).toBe(SUCCESS_LIFETIME_MS - 4000);
    const resumed = resumeTimer(paused, 60_000);
    expect(timeLeft(resumed, 60_000 + 1000)).toBe(SUCCESS_LIFETIME_MS - 4000 - 1000);
  });

  it("survives repeated hover in and out, consuming only the running time", () => {
    let timer = startTimer(0);
    timer = pauseTimer(timer, 1000);
    timer = resumeTimer(timer, 5000);
    timer = pauseTimer(timer, 6000);
    timer = resumeTimer(timer, 9000);
    expect(timeLeft(timer, 9000 + 500)).toBe(SUCCESS_LIFETIME_MS - 1000 - 1000 - 500);
  });

  it("ignores a second pause or resume rather than double-counting", () => {
    const paused = pauseTimer(startTimer(0), 1000);
    expect(pauseTimer(paused, 9000)).toBe(paused);
    const resumed = resumeTimer(paused, 2000);
    expect(resumeTimer(resumed, 9000)).toBe(resumed);
  });
});
