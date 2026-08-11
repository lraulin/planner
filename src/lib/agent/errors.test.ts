import { describe, expect, it } from "vitest";
import { AgentError, httpStatusFor, toAgentError } from "./errors";

describe("httpStatusFor", () => {
  it("maps each code to its HTTP status", () => {
    expect(httpStatusFor("unauthorized")).toBe(401);
    expect(httpStatusFor("validation")).toBe(400);
    expect(httpStatusFor("not_found")).toBe(404);
    expect(httpStatusFor("conflict")).toBe(409);
    expect(httpStatusFor("internal")).toBe(500);
  });
});

describe("toAgentError", () => {
  it("passes AgentError through unchanged", () => {
    const err = new AgentError("conflict", "already filed");
    expect(toAgentError(err)).toBe(err);
  });

  it("classifies domain not-found messages without listing every noun", () => {
    // The generic "not found" match is what keeps new tables from shipping as 500s.
    for (const message of [
      "Contact not found.",
      "Exercise not found.",
      "Session not found.",
      "Resource not found.",
      "Daily item not found.",
      "Owner not found.",
      "Inbox item not found.",
      "Destination not found.",
      "List row not found: abc",
      "Node not found: abc",
      "Note not found.",
    ]) {
      const mapped = toAgentError(new Error(message));
      expect(mapped.code, message).toBe("not_found");
      expect(mapped.message, message).toBe(message);
    }
  });

  it("classifies common validation phrasing", () => {
    expect(toAgentError(new Error("Effort is only tracked on tasks.")).code).toBe(
      "validation",
    );
    expect(toAgentError(new Error("Date must be YYYY-MM-DD.")).code).toBe("validation");
    expect(toAgentError(new Error("Cannot go under a task.")).code).toBe("validation");
  });

  it("hides unexpected internals behind a generic 500 body", () => {
    const mapped = toAgentError(new Error("ECONNRESET from postgres"));
    expect(mapped.code).toBe("internal");
    expect(mapped.message).toBe("Internal error");
  });
});
