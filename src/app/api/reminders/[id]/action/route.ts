import { AgentError } from "@/lib/agent/errors";
import { errorResponse, successResponse } from "@/lib/agent/envelope";
import { findCurrentAccount } from "@/lib/auth";
import { completeReminder, snoozeReminder } from "@/lib/reminders/mutations";

/**
 * The buttons on a notification — Complete, Snooze 15 min — posted by the service worker
 * with the session cookie. Browsers that show notification actions (desktop Chrome) use it;
 * on iPhone a tap opens the Reminders panel instead, which uses server actions.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const account = await findCurrentAccount();
    if (!account) throw new AgentError("unauthorized", "Sign in to act on reminders");
    const { id } = await params;

    let action: unknown;
    try {
      action = ((await request.json()) as { action?: unknown }).action;
    } catch {
      throw new AgentError("validation", "Body must be JSON");
    }

    if (action === "complete") {
      await completeReminder(account.id, id);
    } else if (action === "snooze") {
      await snoozeReminder(account.id, id, "15m");
    } else {
      throw new AgentError("validation", "action must be complete or snooze");
    }
    return successResponse({ id, action });
  } catch (error) {
    return errorResponse(error);
  }
}
