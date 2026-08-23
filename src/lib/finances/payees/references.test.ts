import { describe, expect, it } from "vitest";
import { storedSchedulePayeeIds } from "./references";

describe("storedSchedulePayeeIds", () => {
  it("finds ids in is and oneOf conditions without trusting the rest of the blob", () => {
    expect(
      storedSchedulePayeeIds([
        { field: "payee", op: "is", value: "payee-a" },
        { field: "payee", op: "broken", value: ["payee-a", "payee-b", 12] },
        { field: "amount", op: "is", value: -1000 },
      ]),
    ).toEqual(["payee-a", "payee-b"]);
  });
});
