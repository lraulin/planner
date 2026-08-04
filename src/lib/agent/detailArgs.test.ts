import { describe, expect, it } from "vitest";
import {
  detailPatchHasWrites,
  parseNodeDetailPatch,
  stripCreateOnlyArgs,
} from "./detailArgs";
import { AgentError } from "./errors";

describe("parseNodeDetailPatch", () => {
  it("parses core fields including notes and plan dates", () => {
    const patch = parseNodeDetailPatch({
      name: "Taxes",
      notes: "CPA folder on desk",
      focus: true,
      state: "in_progress",
      priorityLetter: "A",
      priorityRank: 1,
      deadline: "2026-04-15",
      targetStartDate: "2026-03-01",
      deferredDate: null,
    });

    expect(patch.name).toBe("Taxes");
    expect(patch.notes).toBe("CPA folder on desk");
    expect(patch.focus).toBe(true);
    expect(patch.state).toBe("in_progress");
    expect(patch.priorityLetter).toBe("A");
    expect(patch.priorityRank).toBe(1);
    expect(patch.deadline).toBeInstanceOf(Date);
    expect(patch.targetStartDate).toBeInstanceOf(Date);
    expect(patch.deferredDate).toBeNull();
  });

  it("parses nested project prose fields", () => {
    const patch = parseNodeDetailPatch({
      project: {
        purpose: "Why we are doing this",
        idealVision: "Best outcome",
        strategy: "How",
        description: "Details",
        contexts: ["@office"],
        expectedCost: 1200.5,
      },
    });

    expect(patch.project).toMatchObject({
      purpose: "Why we are doing this",
      idealVision: "Best outcome",
      strategy: "How",
      description: "Details",
      contexts: ["@office"],
      expectedCost: "1200.5",
    });
  });

  it("merges top-level effortMinutes into task when nested effort is absent", () => {
    const patch = parseNodeDetailPatch({ effortMinutes: 45 });
    expect(patch.task).toEqual({ effortMinutes: 45 });
  });

  it("prefers nested task.effortMinutes over top-level", () => {
    const patch = parseNodeDetailPatch({
      effortMinutes: 45,
      task: { effortMinutes: 15, description: "Quick" },
    });
    expect(patch.task).toMatchObject({ effortMinutes: 15, description: "Quick" });
  });

  it("rejects unknown nested fields so the agent can correct itself", () => {
    expect(() => parseNodeDetailPatch({ project: { notAField: "x" } })).toThrow(
      AgentError,
    );
    expect(() => parseNodeDetailPatch({ project: { notAField: "x" } })).toThrow(
      /Unknown field project.notAField/,
    );
  });

  it("requires priorityLetter when priorityRank is set", () => {
    expect(() => parseNodeDetailPatch({ priorityRank: 2 })).toThrow(
      /priorityRank requires priorityLetter/,
    );
  });

  it("rejects a non-object project half", () => {
    expect(() => parseNodeDetailPatch({ project: "nope" })).toThrow(/project must be/);
  });
});

describe("detailPatchHasWrites", () => {
  it("is false for an empty patch", () => {
    expect(detailPatchHasWrites({})).toBe(false);
    expect(detailPatchHasWrites({ project: {} })).toBe(false);
  });

  it("is true when any core or nested field is present", () => {
    expect(detailPatchHasWrites({ notes: "" })).toBe(true);
    expect(detailPatchHasWrites({ project: { purpose: "x" } })).toBe(true);
  });
});

describe("stripCreateOnlyArgs", () => {
  it("drops type, parentId, and id", () => {
    expect(
      stripCreateOnlyArgs({
        type: "project",
        parentId: "abc",
        id: "xyz",
        name: "Keep",
        notes: "n",
      }),
    ).toEqual({ name: "Keep", notes: "n" });
  });
});
