/**
 * Structured errors for the agent HTTP API. Route handlers map these to the envelope
 * and HTTP status; domain `Error` messages are classified when possible.
 */

export type AgentErrorCode =
  "unauthorized" | "validation" | "not_found" | "conflict" | "internal";

export class AgentError extends Error {
  readonly code: AgentErrorCode;

  constructor(code: AgentErrorCode, message: string) {
    super(message);
    this.name = "AgentError";
    this.code = code;
  }
}

export function httpStatusFor(code: AgentErrorCode): number {
  switch (code) {
    case "unauthorized":
      return 401;
    case "validation":
      return 400;
    case "not_found":
      return 404;
    case "conflict":
      return 409;
    case "internal":
      return 500;
  }
}

/** Turn unknown throws into AgentError without leaking internals for unexpected ones. */
export function toAgentError(err: unknown): AgentError {
  if (err instanceof AgentError) return err;

  const message = err instanceof Error ? err.message : "Unexpected error";
  const lower = message.toLowerCase();

  if (
    lower.includes("not found") ||
    lower.includes("item not found") ||
    lower.includes("note not found") ||
    lower.includes("appointment not found") ||
    lower.includes("weekly plan not found") ||
    lower.includes("time chart not found")
  ) {
    return new AgentError("not_found", message);
  }

  if (
    lower.includes("cannot go under") ||
    lower.includes("must be after") ||
    lower.includes("cannot be moved") ||
    lower.includes("effort is only tracked") ||
    lower.includes("sibling") ||
    lower.includes("required")
  ) {
    return new AgentError("validation", message);
  }

  return new AgentError("internal", "Internal error");
}
