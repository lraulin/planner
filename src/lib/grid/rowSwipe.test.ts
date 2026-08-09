import { describe, expect, it, vi } from "vitest";
import { rowSwipeFor } from "./rowSwipe";

describe("rowSwipeFor", () => {
  it("keeps Delete but removes lifecycle swipe for a Result Area", () => {
    const swipe = rowSwipeFor({
      selection: {
        id: "ra",
        state: null,
        stateReason: "Result Areas do not have a state",
      },
      actions: { onSetState: () => {}, onDelete: () => {} },
    });
    expect(swipe.right).toBeUndefined();
    expect(swipe.left?.label).toBe("Delete");
  });

  it("still completes stateful work", () => {
    const onSetState = vi.fn();
    const swipe = rowSwipeFor({
      selection: { id: "task", state: "not_started" },
      actions: { onSetState },
    });
    swipe.right?.run();
    expect(onSetState).toHaveBeenCalledWith(["task"], "completed");
  });
});
