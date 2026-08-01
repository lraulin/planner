import { describe, expect, it } from "vitest";
import {
  AXIS_LOCK_PX,
  SWIPE_MAX_PX,
  SWIPE_TRIGGER_PX,
  swipeAction,
  swipeAxis,
  swipeOffset,
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
  it("follows the finger while horizontal", () => {
    expect(swipeOffset(40, "horizontal")).toBe(40);
    expect(swipeOffset(-40, "horizontal")).toBe(-40);
  });

  it("clamps in both directions so the gesture has a ceiling", () => {
    expect(swipeOffset(500, "horizontal")).toBe(SWIPE_MAX_PX);
    expect(swipeOffset(-500, "horizontal")).toBe(-SWIPE_MAX_PX);
  });

  it("never moves the row for a vertical or uncommitted gesture", () => {
    expect(swipeOffset(40, "vertical")).toBe(0);
    expect(swipeOffset(40, "none")).toBe(0);
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
