import { AgentError } from "@/lib/agent/errors";
import { errorResponse, successResponse } from "@/lib/agent/envelope";
import { fireOccurrence } from "@/lib/reminders/arm";
import { requireQStashSignature } from "@/lib/reminders/callerAuth";

/**
 * QStash's callback at a reminder's minute: `{ id, fireAt }`, signed.
 *
 * 200 whatever the outcome — `fired`, `stale` or `superseded` — because a stale message is
 * the normal fate of an edited reminder, not an error, and a non-2xx would make QStash retry
 * something that will never become valid.
 *
 * Spec: `agent-os/specs/2026-10-28-2101-reminders-and-push-notifications/`.
 */
export async function POST(request: Request) {
  try {
    const body = await request.text();
    await requireQStashSignature(request, body);

    let message: unknown;
    try {
      message = JSON.parse(body);
    } catch {
      throw new AgentError("validation", "Body must be JSON");
    }
    const { id, fireAt } = (message ?? {}) as Record<string, unknown>;
    if (
      typeof id !== "string" ||
      typeof fireAt !== "string" ||
      Number.isNaN(Date.parse(fireAt))
    ) {
      throw new AgentError("validation", "id and an ISO fireAt are required");
    }

    const outcome = await fireOccurrence(id, new Date(fireAt));
    return successResponse({ outcome });
  } catch (error) {
    return errorResponse(error);
  }
}
