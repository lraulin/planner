import { describe, expect, it } from "vitest";
import {
  assertSupportsLifecycleState,
  initialStateForType,
  lifecycleStateRefusal,
  supportsLifecycleState,
} from "./lifecycle";

describe("Result Area lifecycle support", () => {
  it("makes new Result Areas state-less and every finite item Not started", () => {
    expect(initialStateForType("result_area")).toBeNull();
    for (const type of ["goal", "project", "task"] as const) {
      expect(supportsLifecycleState(type)).toBe(true);
      expect(initialStateForType(type)).toBe("not_started");
    }
  });

  it("rejects a Result Area at the shared mutation boundary", () => {
    expect(() => assertSupportsLifecycleState("result_area")).toThrow(
      "Result Areas do not have a state.",
    );
  });

  it("gives a specific refusal for single and mixed selections", () => {
    expect(lifecycleStateRefusal(["result_area"])).toBe(
      "Result Areas do not have a state",
    );
    expect(lifecycleStateRefusal(["result_area", "result_area"])).toBe(
      "Result Areas do not have a state",
    );
    expect(lifecycleStateRefusal(["task", "result_area"])).toBe(
      "Result Areas do not have a state; remove them from the selection",
    );
    expect(lifecycleStateRefusal(["task"])).toBeNull();
  });
});
