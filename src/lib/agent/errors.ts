/**
 * Structured errors for the agent HTTP API. Route handlers map these to the envelope
 * and HTTP status; domain `Error` messages are classified when possible.
 */

import {
  GoogleApiError,
  GoogleEventGoneError,
  GoogleNotLinkedError,
} from "@/lib/google/errors";

export type AgentErrorCode =
  | "unauthorized"
  | "validation"
  | "not_found"
  | "conflict"
  /** Google is unlinked or its grant was revoked: only the user reconnecting fixes it. */
  | "reconnect_google"
  /** Google answered with an error of its own (5xx, rate limit, unexpected 4xx). */
  | "upstream"
  | "internal";

export class AgentError extends Error {
  readonly code: AgentErrorCode;
  /**
   * Short id printed next to the real error in the server log, for failures whose message
   * is not the whole story. Quote it back and the log line is one search away.
   */
  readonly errorId?: string;

  constructor(code: AgentErrorCode, message: string, errorId?: string) {
    super(message);
    this.name = "AgentError";
    this.code = code;
    this.errorId = errorId;
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
    case "reconnect_google":
      // Failed Dependency: the request was fine; the Google link it relies on is not.
      return 424;
    case "upstream":
      return 502;
    case "internal":
      return 500;
  }
}

function newErrorId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/**
 * Log the real error under a fresh id and return the id. The caller only ever sees the id
 * and a safe message; the stack stays in the server log, where it can be found again.
 */
export function logAgentError(error: unknown, context = "Agent tool failed"): string {
  const errorId = newErrorId();
  console.error(`[agent-error ${errorId}] ${context}`, error);
  return errorId;
}

/** Longest slice of Google's own error body that is worth handing back to a caller. */
const UPSTREAM_DETAIL_LIMIT = 300;

function fromGoogleError(err: Error): AgentError | null {
  if (err instanceof GoogleNotLinkedError) {
    const message = /reconnect/i.test(err.message)
      ? err.message
      : `${err.message} Reconnect Google in Planner settings, then retry.`;
    return new AgentError("reconnect_google", message, logAgentError(err));
  }
  if (err instanceof GoogleEventGoneError) {
    return new AgentError("not_found", err.message);
  }
  if (err instanceof GoogleApiError) {
    const transient = err.status >= 500 || err.status === 429;
    const detail =
      err.message.length > UPSTREAM_DETAIL_LIMIT
        ? `${err.message.slice(0, UPSTREAM_DETAIL_LIMIT)}…`
        : err.message;
    return new AgentError(
      "upstream",
      transient
        ? `Google Calendar is failing right now (HTTP ${err.status}); nothing was changed. Retry shortly. ${detail}`
        : `Google Calendar rejected the change (HTTP ${err.status}); nothing was changed. ${detail}`,
      logAgentError(err),
    );
  }
  return null;
}

/**
 * Turn unknown throws into AgentError without leaking internals for unexpected ones.
 *
 * Anything unrecognised becomes `internal` with a logged error id, so "Internal error" is
 * never a dead end: the id finds the stack in the server log.
 */
export function toAgentError(err: unknown): AgentError {
  if (err instanceof AgentError) return err;

  if (err instanceof Error) {
    const google = fromGoogleError(err);
    if (google) return google;
  }

  const message = err instanceof Error ? err.message : "Unexpected error";
  const lower = message.toLowerCase();

  if (
    lower.includes("not found") ||
    lower.includes("does not exist") ||
    lower.includes("item not found") ||
    lower.includes("note not found") ||
    lower.includes("appointment not found") ||
    lower.includes("weekly plan not found") ||
    lower.includes("time chart not found") ||
    lower.includes("metric not found") ||
    lower.includes("metric entry not found")
  ) {
    return new AgentError("not_found", message);
  }

  if (
    lower.includes("cannot go under") ||
    lower.includes("must be after") ||
    lower.includes("cannot be before") ||
    lower.includes("cannot be moved") ||
    lower.includes("effort is only tracked") ||
    lower.includes("sibling") ||
    lower.includes("required") ||
    lower.includes("must be") ||
    lower.includes("finite number") ||
    lower.includes("yyyy-mm-dd")
  ) {
    return new AgentError("validation", message);
  }

  return new AgentError("internal", "Internal error", logAgentError(err));
}

/**
 * The one-line form a tool caller reads: code first so a client can branch on it, the
 * message, then the error id when there is a log line behind it.
 */
export function formatAgentErrorText(err: AgentError): string {
  const id = err.errorId ? ` (error id ${err.errorId})` : "";
  return `${err.code}: ${err.message}${id}`;
}
