import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { exportAchieveXmlForUser } from "@/lib/achieve/exportLoad";

/**
 * GET Achieve Full XML for the signed-in account as a downloadable file.
 *
 * Route handler (not a Server Action) so large exports are not Flight-serialized back to
 * the client as a return value.
 */
export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const result = await exportAchieveXmlForUser(userId);
    const filename = `planner-export-${new Date().toISOString().slice(0, 10)}.achxml`;

    return new NextResponse(result.xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        // Small summary for the UI without stuffing the body into JSON.
        "X-Achieve-Export-Counts": JSON.stringify({
          result_area: result.counts.result_area,
          goal: result.counts.goal,
          project: result.counts.project,
          task: result.counts.task,
          omitted: result.counts.omitted,
        }),
        "X-Achieve-Export-Warnings": String(result.warnings.length),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Export failed.",
      },
      { status: 500 },
    );
  }
}
