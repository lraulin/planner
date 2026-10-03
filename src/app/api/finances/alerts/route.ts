import { NextResponse } from "next/server";
import { requireAgentApiKey } from "@/lib/agent/auth";
import { AgentError } from "@/lib/agent/errors";
import { errorResponse } from "@/lib/agent/envelope";
import { getAgentUserId } from "@/lib/auth/identity";
import { AlertRejected, applyAlertEmail } from "@/lib/finances/alertIngestWrite";

const MAX_BODY_BYTES = 512 * 1024;

/**
 * POST a bank alert email as JSON `{ messageId, from, subject, receivedAt, plainText, htmlBody? }`.
 *
 * Called by the time-triggered Apps Script in Lee's Gmail (`scripts/gmail-alert-push.gs`),
 * so auth is the agent Bearer key, not a session. 200 means the alert is accounted for (a
 * re-push too); 422 means it was read and refused, with an audit event holding the raw text,
 * and the script should stop retrying it.
 *
 * Spec: `agent-os/specs/2026-10-03-1500-card-holds-from-alert-emails/`.
 */
export async function POST(request: Request) {
  try {
    requireAgentApiKey(request);
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      throw new AgentError("validation", "Alert body is too large");
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new AgentError("validation", "Request body must be valid JSON");
    }
    const record = (body ?? {}) as Record<string, unknown>;
    const { messageId, from, subject, receivedAt, plainText, htmlBody } = record;
    if (
      typeof messageId !== "string" ||
      messageId.trim() === "" ||
      typeof from !== "string" ||
      typeof subject !== "string" ||
      typeof plainText !== "string" ||
      typeof receivedAt !== "string" ||
      Number.isNaN(Date.parse(receivedAt)) ||
      (htmlBody !== undefined && typeof htmlBody !== "string")
    ) {
      throw new AgentError(
        "validation",
        "messageId, from, subject, plainText and an ISO receivedAt are required",
      );
    }

    const userId = await getAgentUserId();
    const result = await applyAlertEmail(userId, {
      messageId: messageId.trim(),
      from,
      subject,
      receivedAt: new Date(receivedAt),
      plainText,
      htmlBody,
    });
    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    if (err instanceof AlertRejected) {
      return NextResponse.json(
        { ok: false, error: { code: "rejected", message: err.message } },
        { status: 422 },
      );
    }
    return errorResponse(err);
  }
}
