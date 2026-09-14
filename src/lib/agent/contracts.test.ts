import { describe, expect, it } from "vitest";
import {
  GOAL_KEYS,
  PROJECT_KEYS,
  RESULT_AREA_KEYS,
  TASK_KEYS,
} from "@/lib/detail/mutations";
import { inputSchemas } from "./contracts";

/**
 * `update_node`'s per-type side objects (`resultArea`/`goal`/`project`/`task`) build their
 * Zod schema from a hand-maintained key→type classification in contracts.ts (MONEY_KEYS,
 * DATE_KEYS, BOOLEAN_KEYS, NUMBER_KEYS, ARRAY_KEYS, NUMBER_ARRAY_KEYS, ENUMS) rather than
 * deriving it from `src/db/schema.ts`. `mutations.integration.test.ts` already guards that
 * every schema column has a matching *_KEYS entry (`detail/mutations.ts`'s own docstring
 * calls that allowlist "a silent-failure machine"), but nothing guarded the second half: a
 * key present in TASK_KEYS/etc. that contracts.ts forgot to classify falls through to the
 * generic `z.string().nullable()` default, which silently rejects (or worse, coerces) a
 * boolean/number/date/array value an agent actually sends.
 *
 * This is an independent oracle, not a copy of contracts.ts's own tables: every expected
 * type below was read straight from `task_details` / `project_details` / `goal_details` /
 * `result_area_details` in schema.ts, not from contracts.ts. If contracts.ts's
 * classification drifts from the real column type, one of these fully-populated payloads
 * stops parsing.
 */

const NODE_ID = "123e4567-e89b-12d3-a456-426614174000";

function parseUpdate(kind: "resultArea" | "goal" | "project" | "task", fields: object) {
  return inputSchemas.update_node.safeParse({ id: NODE_ID, [kind]: fields });
}

describe("update_node task fields match task_details' real column types", () => {
  it("accepts a value of the correct type for every TASK_KEYS field", () => {
    const fields: Record<(typeof TASK_KEYS)[number], unknown> = {
      effortMinutes: 30,
      effortLeftMinutes: 15,
      actualEffortMinutes: 10,
      percentComplete: 50,
      contexts: ["@home"],
      recurrenceFrequency: "weekly",
      recurrenceInterval: 2,
      recurrenceMode: "scheduled",
      recurrencePattern: "by_weekday",
      recurrenceByWeekday: [1, 3, 5],
      recurrenceMonthDay: 15,
      recurrenceOrdinal: 1,
      recurrenceWeekday: 2,
      recurrenceMonth: 6,
      recurrenceEnd: "count",
      recurrenceCount: 10,
      recurrenceUntil: "2027-01-01T00:00:00.000Z",
      leadTimeMinutes: 5,
      deadlineLeadTimeMinutes: 60,
      source: "manual",
      place: "Home office",
      reminderAt: "2027-01-01T09:00:00.000Z",
      private: true,
      effortDriven: false,
      milestone: true,
      actualStartDate: "2026-12-01T00:00:00.000Z",
      dateCompleted: "2026-12-15T00:00:00.000Z",
      durationMinutes: 90,
      constraint: "must_start_on",
      constraintDate: "2026-12-01T00:00:00.000Z",
      wbs: "1.2.3",
      costLow: 10.5,
      costHigh: 20.5,
      actualCost: 15.75,
      billingInformation: "Net 30",
      company: "Acme",
      mileage: "12,000 mi",
      description: "Longer free-text description.",
      contactId: NODE_ID,
    };
    const result = parseUpdate("task", fields);
    expect(result.success).toBe(true);
    // Every key TASK_KEYS declares must actually have been exercised above — this test is
    // only complete coverage if the two lists match.
    expect(Object.keys(fields).sort()).toEqual([...TASK_KEYS].sort());
  });
});

describe("update_node goal fields match goal_details' real column types", () => {
  it("accepts a value of the correct type for every GOAL_KEYS field", () => {
    const fields: Record<(typeof GOAL_KEYS)[number], unknown> = {
      isDream: true,
      range: "Yearly",
      plannedStart: "2027-01-01T00:00:00.000Z",
      values: "Growth, family",
      question: "What matters most?",
      affirmation: "I follow through.",
      definition: "A clear, specific outcome.",
      purpose: "Because it matters.",
      contexts: ["@personal"],
      vision: "A vivid picture of success.",
      kindOfPerson: "Disciplined",
      personalChanges: "Wake earlier",
      baseline: "Where things stand today",
      limitingFactor: "Time",
      strategy: "One step a day",
      progressReview: "weekly",
      scorecard: false,
    };
    const result = parseUpdate("goal", fields);
    expect(result.success).toBe(true);
    expect(Object.keys(fields).sort()).toEqual([...GOAL_KEYS].sort());
  });
});

describe("update_node project fields match project_details' real column types", () => {
  it("accepts a value of the correct type for every PROJECT_KEYS field", () => {
    const fields: Record<(typeof PROJECT_KEYS)[number], unknown> = {
      effortDriven: true,
      onlyShowNextTask: false,
      leadTimeMinutes: 30,
      blockSizeMinutes: 60,
      timePerWeekMinutes: 300,
      recomputeTaskDeadlines: true,
      reminderAt: "2027-01-01T09:00:00.000Z",
      sensitivity: "confidential",
      assignedTo: "Lee",
      place: "Remote",
      contexts: ["@work"],
      purpose: "Ship the thing",
      idealVision: "Done well and on time",
      sufficientVision: "Done and shipped",
      strategy: "Break into weekly milestones",
      billingInformation: "Net 30",
      company: "Acme",
      mileage: "500 mi",
      expectedCost: 1000.0,
      lowCost: 800.0,
      highCost: 1200.0,
      costToDate: 250.5,
      description: "Longer free-text description.",
    };
    const result = parseUpdate("project", fields);
    expect(result.success).toBe(true);
    expect(Object.keys(fields).sort()).toEqual([...PROJECT_KEYS].sort());
  });
});

describe("update_node result-area fields match result_area_details' real column types", () => {
  it("accepts a value of the correct type for every RESULT_AREA_KEYS field", () => {
    const fields: Record<(typeof RESULT_AREA_KEYS)[number], unknown> = {
      color: "#336699",
      category: "Health",
      description: "Longer free-text description.",
      importance: 80,
      reason: "Because health underlies everything else.",
      mission: "Stay strong and capable.",
      idealOuterVision: "Active and energetic",
      idealInnerVision: "Calm and resilient",
      strengths: "Consistency",
      weaknesses: "Sleep",
      opportunities: "More morning routine time",
      threats: "Travel disrupting habits",
    };
    const result = parseUpdate("resultArea", fields);
    expect(result.success).toBe(true);
    expect(Object.keys(fields).sort()).toEqual([...RESULT_AREA_KEYS].sort());
  });
});

describe("update_node rejects a boolean field sent as its wrong JS type", () => {
  it("rejects milestone as a string instead of a boolean", () => {
    // Guards the actual failure mode this file exists for: a field that quietly fell
    // through to the generic string default would *accept* "true" here instead of
    // rejecting it, and the mistake would only surface as a wrong stored value.
    const result = parseUpdate("task", { milestone: "true" });
    expect(result.success).toBe(false);
  });

  it("rejects private as a string instead of a boolean", () => {
    const result = parseUpdate("task", { private: "yes" });
    expect(result.success).toBe(false);
  });
});
