import { describe, expect, it } from "vitest";
import {
  AXIS_LOCK_PX,
  SWIPE_MAX_PX,
  SWIPE_TRIGGER_PX,
  swipeAction,
  swipeAxis,
  swipeOffset,
  swipeProgress,
} from "@/lib/touch/swipe";

describe("swipeAxis", () => {
  it("commits to nothing until the gesture clears the lock distance", () => {
    expect(swipeAxis(5, 5)).toBe("none");
    expect(swipeAxis(AXIS_LOCK_PX - 1, 0)).toBe("none");
    expect(swipeAxis(0, AXIS_LOCK_PX - 1)).toBe("none");
  });

  it("locks horizontal only when the gesture is mostly horizontal", () => {
    expect(swipeAxis(40, 5)).toBe("horizontal");
    expect(swipeAxis(-40, 5)).toBe("horizontal");
  });

  it("locks vertical so the list keeps scrolling", () => {
    expect(swipeAxis(5, 40)).toBe("vertical");
    expect(swipeAxis(20, 60)).toBe("vertical");
  });

  it("gives an exact diagonal to the scroll", () => {
    // A drag at 45 degrees is a crooked scroll far more often than an aimed swipe, and
    // stealing it from the list is the worse failure.
    expect(swipeAxis(40, 40)).toBe("vertical");
    expect(swipeAxis(-40, -40)).toBe("vertical");
  });

  it("commits as soon as either axis clears the lock, not both", () => {
    expect(swipeAxis(AXIS_LOCK_PX + 1, 0)).toBe("horizontal");
    expect(swipeAxis(0, AXIS_LOCK_PX + 1)).toBe("vertical");
  });
});

describe("swipeOffset", () => {
  it("follows the finger exactly up to the trigger", () => {
    expect(swipeOffset(40, "horizontal")).toBe(40);
    expect(swipeOffset(-40, "horizontal")).toBe(-40);
    expect(swipeOffset(SWIPE_TRIGGER_PX, "horizontal")).toBe(SWIPE_TRIGGER_PX);
  });

  it("resists past the trigger without ever reaching the ceiling", () => {
    const far = swipeOffset(500, "horizontal");
    expect(far).toBeGreaterThan(SWIPE_TRIGGER_PX);
    expect(far).toBeLessThan(SWIPE_MAX_PX);
    expect(swipeOffset(-500, "horizontal")).toBe(-far);
  });

  it("keeps resisting rather than stopping dead, however far the finger goes", () => {
    // The point of the curve: a row that stops moving under a finger that has not reads as
    // a broken page. Each further pixel still moves it, by less.
    const near = swipeOffset(120, "horizontal");
    const far = swipeOffset(400, "horizontal");
    const further = swipeOffset(4000, "horizontal");
    expect(far).toBeGreaterThan(near);
    expect(further).toBeGreaterThan(far);
    expect(further).toBeLessThan(SWIPE_MAX_PX);
  });

  it("hands over from tracking to resistance without a jump", () => {
    // Slope 1 on both sides of the trigger, so there is no visible kink where the finger
    // crosses it.
    const before = swipeOffset(SWIPE_TRIGGER_PX - 0.5, "horizontal");
    const after = swipeOffset(SWIPE_TRIGGER_PX + 0.5, "horizontal");
    expect(after - before).toBeGreaterThan(0.9);
    expect(after - before).toBeLessThan(1.01);
  });

  it("never moves the row for a vertical or uncommitted gesture", () => {
    expect(swipeOffset(40, "vertical")).toBe(0);
    expect(swipeOffset(40, "none")).toBe(0);
  });

  it("degrades to a clamp when the caller leaves no slack to stretch into", () => {
    expect(swipeOffset(500, "horizontal", 40, 40)).toBe(40);
    expect(swipeOffset(-500, "horizontal", 40, 40)).toBe(-40);
  });
});

describe("swipeProgress", () => {
  it("runs from nothing to armed across the trigger distance", () => {
    expect(swipeProgress(0, "horizontal")).toBe(0);
    expect(swipeProgress(SWIPE_TRIGGER_PX / 2, "horizontal")).toBeCloseTo(0.5);
    expect(swipeProgress(SWIPE_TRIGGER_PX, "horizontal")).toBe(1);
  });

  it("reads the same in both directions", () => {
    expect(swipeProgress(-30, "horizontal")).toBe(swipeProgress(30, "horizontal"));
  });

  it("stays at 1 past the trigger, since there is no more commitment to show", () => {
    expect(swipeProgress(500, "horizontal")).toBe(1);
  });

  it("is nothing at all for a vertical or uncommitted gesture", () => {
    expect(swipeProgress(500, "vertical")).toBe(0);
    expect(swipeProgress(500, "none")).toBe(0);
  });
});

describe("swipeAction", () => {
  it("triggers once past the threshold, in either direction", () => {
    expect(swipeAction(-SWIPE_TRIGGER_PX, "horizontal")).toBe("left");
    expect(swipeAction(SWIPE_TRIGGER_PX, "horizontal")).toBe("right");
  });

  it("does nothing short of the threshold", () => {
    expect(swipeAction(SWIPE_TRIGGER_PX - 1, "horizontal")).toBe("none");
    expect(swipeAction(-(SWIPE_TRIGGER_PX - 1), "horizontal")).toBe("none");
  });

  it("does nothing on a vertical or uncommitted gesture, however far it travelled", () => {
    expect(swipeAction(500, "vertical")).toBe("none");
    expect(swipeAction(500, "none")).toBe("none");
  });

  it("still triggers past the clamp, since the row stops but the finger does not", () => {
    expect(swipeAction(500, "horizontal")).toBe("right");
  });

  it("respects a caller-supplied trigger distance", () => {
    expect(swipeAction(30, "horizontal", 20)).toBe("right");
    expect(swipeAction(30, "horizontal", 200)).toBe("none");
  });
});
