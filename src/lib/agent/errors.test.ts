import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GoogleApiError,
  GoogleEventGoneError,
  GoogleNotLinkedError,
} from "@/lib/google/errors";
import {
  AgentError,
  formatAgentErrorText,
  httpStatusFor,
  toAgentError,
} from "./errors";

/** Silence and capture the server log the mapper writes for unexpected failures. */
function captureLog() {
  return vi.spyOn(console, "error").mockImplementation(() => undefined);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("httpStatusFor", () => {
  it("maps each code to its HTTP status", () => {
    expect(httpStatusFor("unauthorized")).toBe(401);
    expect(httpStatusFor("validation")).toBe(400);
    expect(httpStatusFor("not_found")).toBe(404);
    expect(httpStatusFor("conflict")).toBe(409);
    expect(httpStatusFor("internal")).toBe(500);
    expect(httpStatusFor("reconnect_google")).toBe(424);
    expect(httpStatusFor("upstream")).toBe(502);
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
    captureLog();
    const mapped = toAgentError(new Error("ECONNRESET from postgres"));
    expect(mapped.code).toBe("internal");
    expect(mapped.message).toBe("Internal error");
  });

  it("logs an unexpected failure under the error id it hands back", () => {
    const log = captureLog();
    const cause = new Error("ECONNRESET from postgres");
    const mapped = toAgentError(cause);

    expect(mapped.errorId).toMatch(/^[0-9a-f]{8}$/);
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toContain(mapped.errorId);
    // The real error reaches the log even though the caller only sees "Internal error".
    expect(log.mock.calls[0]).toContain(cause);
  });

  it("does not log or re-id an error that is already an AgentError", () => {
    const log = captureLog();
    const first = toAgentError(new Error("boom"));
    expect(toAgentError(first)).toBe(first);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("tells the caller to reconnect when Google is not linked", () => {
    captureLog();
    const mapped = toAgentError(new GoogleNotLinkedError());
    expect(mapped.code).toBe("reconnect_google");
    expect(mapped.message).toMatch(/Google is not connected/);
    expect(mapped.message).toMatch(/Reconnect Google/);
    expect(mapped.errorId).toBeDefined();
  });

  it("keeps a revoked-grant message that already says to reconnect", () => {
    captureLog();
    const message = "Google access was revoked. Reconnect to resume syncing.";
    expect(toAgentError(new GoogleNotLinkedError(message)).message).toBe(message);
  });

  it("maps a vanished Google event to not_found with its own sentence", () => {
    const mapped = toAgentError(
      new GoogleEventGoneError("This event no longer exists in Google Calendar."),
    );
    expect(mapped.code).toBe("not_found");
    expect(mapped.message).toBe("This event no longer exists in Google Calendar.");
  });

  it("reports a Google 5xx as a retryable upstream failure with the status", () => {
    captureLog();
    const mapped = toAgentError(
      new GoogleApiError(503, "Google Calendar API 503: backendError"),
    );
    expect(mapped.code).toBe("upstream");
    expect(mapped.message).toMatch(/HTTP 503/);
    expect(mapped.message).toMatch(/Retry/);
    expect(mapped.message).toMatch(/nothing was changed/);
  });

  it("reports a Google 4xx rejection without inviting a blind retry", () => {
    captureLog();
    const mapped = toAgentError(
      new GoogleApiError(400, `Google Calendar API 400: ${"x".repeat(1000)}`),
    );
    expect(mapped.code).toBe("upstream");
    expect(mapped.message).toMatch(/rejected the change \(HTTP 400\)/);
    expect(mapped.message).not.toMatch(/Retry/);
    // Google's body can be kilobytes of JSON; the caller gets a bounded slice.
    expect(mapped.message.length).toBeLessThan(500);
  });
});

describe("formatAgentErrorText", () => {
  it("leads with the code and ends with the error id when there is one", () => {
    expect(
      formatAgentErrorText(new AgentError("internal", "Internal error", "ab12cd34")),
    ).toBe("internal: Internal error (error id ab12cd34)");
    expect(formatAgentErrorText(new AgentError("not_found", "Node not found: x"))).toBe(
      "not_found: Node not found: x",
    );
  });
});
