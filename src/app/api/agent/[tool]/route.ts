import { requireAgentApiKey } from "@/lib/agent/auth";
import { errorResponse, successResponse } from "@/lib/agent/envelope";
import { AgentError } from "@/lib/agent/errors";
import { dispatchAgentTool } from "@/lib/agent/tools";

/**
 * Tool-oriented agent API: POST /api/agent/{tool}
 *
 * Auth: Authorization: Bearer $PLANNER_AGENT_API_KEY
 * Body: JSON object of tool arguments (or {}).
 * Envelope: { ok: true, data } | { ok: false, error: { code, message } }
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ tool: string }> },
) {
  try {
    requireAgentApiKey(request);
    const { tool } = await context.params;

    let body: unknown = {};
    const text = await request.text();
    if (text.trim()) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        throw new AgentError("validation", "Request body must be valid JSON");
      }
    }

    const data = await dispatchAgentTool(tool, body);
    return successResponse(data);
  } catch (err) {
    return errorResponse(err);
  }
}

/** Discoverability for humans and agents that probe with GET. */
export async function GET(
  request: Request,
  context: { params: Promise<{ tool: string }> },
) {
  try {
    requireAgentApiKey(request);
    const { tool } = await context.params;
    if (tool === "health" || tool === "list_tools") {
      const data = await dispatchAgentTool(tool, {});
      return successResponse(data);
    }
    throw new AgentError(
      "validation",
      "Use POST with a JSON body for tool calls. GET is only supported for health and list_tools.",
    );
  } catch (err) {
    return errorResponse(err);
  }
}
