import { describe, expect, it, vi } from "vitest";
import { asyncHandler } from "./eventHandler";

describe("asyncHandler", () => {
  it("does not call onError when the wrapped function resolves", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();
    asyncHandler(fn, onError)("arg1", 2);
    expect(fn).toHaveBeenCalledWith("arg1", 2);
    // The returned handler is void-returning (fire-and-forget), so let the promise settle.
    await vi.waitFor(() => expect(fn).toHaveResolved());
    expect(onError).not.toHaveBeenCalled();
  });

  it("routes a rejection to onError instead of an unhandled rejection", async () => {
    // The plausible mistake this guards: forgetting `.catch` and letting React drop the
    // promise on the floor, which is the whole reason this wrapper exists.
    const fn = vi.fn().mockRejectedValue(new Error("network down"));
    const onError = vi.fn();
    asyncHandler(fn, onError)();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError).toHaveBeenCalledWith("Something went wrong. Please try again.");
  });

  it("returns void synchronously, never the wrapped function's promise", () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const result = asyncHandler(fn, vi.fn())();
    expect(result).toBeUndefined();
  });
});
