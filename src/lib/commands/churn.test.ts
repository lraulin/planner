import { describe, expect, it } from "vitest";
import {
  advanceCommandChurn,
  COMMAND_CHURN_LIMIT,
  COMMAND_CHURN_WINDOW_MS,
  initialCommandChurnState,
} from "./churn";

describe("command registration churn", () => {
  it("warns once when one command shape is rebuilt in a rapid burst", () => {
    let state = initialCommandChurnState();
    const warnings: boolean[] = [];

    for (let index = 0; index < COMMAND_CHURN_LIMIT + 5; index++) {
      const result = advanceCommandChurn(state, "record.open:Open", index * 10);
      state = result.state;
      warnings.push(result.shouldWarn);
    }

    expect(warnings.filter(Boolean)).toHaveLength(1);
    expect(warnings[COMMAND_CHURN_LIMIT]).toBe(true);
  });

  it("does not mistake ordinary same-shape interactions for a render loop", () => {
    let state = initialCommandChurnState();

    for (let index = 0; index < COMMAND_CHURN_LIMIT * 3; index++) {
      const result = advanceCommandChurn(
        state,
        "record.open:Open",
        index * (COMMAND_CHURN_WINDOW_MS / 2),
      );
      state = result.state;
      expect(result.shouldWarn).toBe(false);
    }
  });

  it("starts a fresh burst when the rendered command shape changes", () => {
    let state = initialCommandChurnState();

    for (let index = 0; index < COMMAND_CHURN_LIMIT; index++) {
      state = advanceCommandChurn(state, "record.open:Open", index * 10).state;
    }

    const changed = advanceCommandChurn(state, "record.open:Close", 250);
    expect(changed.shouldWarn).toBe(false);
    expect(changed.state.count).toBe(1);
  });
});
