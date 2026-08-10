import { describe, expect, it } from "vitest";
import { organizerOutcomeError, type OrganizerOutcome } from "./types";

describe("organizerOutcomeError", () => {
  it("requires a future return date", () => {
    expect(
      organizerOutcomeError(
        {
          kind: "defer",
          deferredUntil: "2026-08-09",
          deadline: null,
          followUpName: "",
        },
        { today: "2026-08-09", hasChildren: false },
      ),
    ).toContain("later than today");
  });

  it.each(["calendar", "reference_note"] as const)(
    "blocks lossy %s replacement when the branch has children",
    (kind) => {
      const outcome =
        kind === "calendar"
          ? ({
              kind,
              subject: "Meet",
              location: "",
              startAt: "2026-08-10T13:00:00.000Z",
              endAt: "2026-08-10T14:00:00.000Z",
              allDay: false,
              projectId: null,
              contexts: [],
              notes: "",
              priorityLetter: null,
              priorityRank: null,
            } satisfies OrganizerOutcome)
          : ({ kind, title: "Reference", body: "" } satisfies OrganizerOutcome);

      expect(
        organizerOutcomeError(outcome, { today: "2026-08-09", hasChildren: true }),
      ).toContain("subtasks");
    },
  );
});
