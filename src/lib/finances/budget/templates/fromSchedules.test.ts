import { describe, expect, it } from "vitest";

import {
  attachedScheduleIds,
  defaultScheduleTarget,
  schedulesToAdd,
  type EnvelopeTemplates,
} from "./fromSchedules";

const bills: EnvelopeTemplates = {
  categoryId: "bills",
  name: "Bills",
  isIncome: false,
  templates: [],
};

const income: EnvelopeTemplates = {
  categoryId: "inc",
  name: "Income",
  isIncome: true,
  templates: [],
};

const rent = { id: "rent", name: "Rent", completed: false };
const geico = { id: "geico", name: "Geico", completed: false };
const paused = { id: "old", name: "Old", completed: true };

describe("schedulesToAdd", () => {
  it("attaches every active not-yet-attached schedule", () => {
    const lines = schedulesToAdd({
      existing: [bills],
      candidates: [rent, geico, paused],
      targetId: "bills",
    });
    expect(lines.map((line) => line.scheduleId).sort()).toEqual(["geico", "rent"]);
    expect(lines.every((line) => line.type === "schedule")).toBe(true);
  });

  it("skips a schedule already attached to any envelope", () => {
    const existing: EnvelopeTemplates = {
      ...bills,
      templates: [
        {
          id: "t1",
          directive: "template",
          type: "schedule",
          priority: 0,
          scheduleId: "rent",
        },
      ],
    };
    const lines = schedulesToAdd({
      existing: [existing],
      candidates: [rent, geico],
      targetId: "bills",
    });
    expect(lines.map((line) => line.scheduleId)).toEqual(["geico"]);
  });

  it("honours an explicit picker set", () => {
    const lines = schedulesToAdd({
      existing: [bills],
      candidates: [rent, geico],
      targetId: "bills",
      scheduleIds: ["geico"],
    });
    expect(lines.map((line) => line.scheduleId)).toEqual(["geico"]);
  });
});

describe("defaultScheduleTarget", () => {
  it("picks Bills by name, ignoring income, else the first spending envelope", () => {
    expect(defaultScheduleTarget([income, bills])).toBe("bills");
    expect(
      defaultScheduleTarget([
        income,
        { categoryId: "disc", name: "Discretionary", isIncome: false, templates: [] },
      ]),
    ).toBe("disc");
  });
});

describe("attachedScheduleIds", () => {
  it("collects schedule ids from every envelope", () => {
    expect(
      attachedScheduleIds([
        {
          ...bills,
          templates: [
            {
              id: "t1",
              directive: "template",
              type: "schedule",
              priority: 0,
              scheduleId: "rent",
            },
          ],
        },
      ]),
    ).toEqual(new Set(["rent"]));
  });
});
