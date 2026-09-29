import { NextResponse } from "next/server";
import {
  type AgentErrorCode,
  httpStatusFor,
  toAgentError,
  type AgentError,
} from "./errors";

export type AgentSuccess<T> = { ok: true; data: T };
export type AgentFailure = {
  ok: false;
  error: { code: AgentErrorCode; message: string; errorId?: string };
};
export type AgentEnvelope<T> = AgentSuccess<T> | AgentFailure;

export function successResponse<T>(data: T, status = 200): NextResponse {
  const body: AgentSuccess<T> = { ok: true, data };
  return NextResponse.json(body, { status });
}

export function errorResponse(err: AgentError | unknown): NextResponse {
  const agentErr = toAgentError(err);
  const body: AgentFailure = {
    ok: false,
    error: {
      code: agentErr.code,
      message: agentErr.message,
      ...(agentErr.errorId ? { errorId: agentErr.errorId } : {}),
    },
  };
  return NextResponse.json(body, { status: httpStatusFor(agentErr.code) });
}
