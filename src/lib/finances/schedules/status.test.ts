import { describe, expect, it } from "vitest";
import { getStatus, getUpcomingDays } from "./status";

const TODAY = "2026-08-22";

describe("getStatus", () => {
  it("walks completed → paid → due → upcoming → missed → scheduled", () => {
    expect(getStatus("2026-08-22", true, false, "7", TODAY)).toBe("completed");
    expect(getStatus("2026-08-22", false, true, "7", TODAY)).toBe("paid");
    expect(getStatus("2026-08-22", false, false, "7", TODAY)).toBe("due");
    expect(getStatus("2026-08-25", false, false, "7", TODAY)).toBe("upcoming");
    expect(getStatus("2026-08-21", false, false, "7", TODAY)).toBe("missed");
    expect(getStatus("2026-09-15", false, false, "7", TODAY)).toBe("scheduled");
  });

  it("does not call a date eight days out upcoming under a 7-day horizon", () => {
    expect(getStatus("2026-08-30", false, false, "7", TODAY)).toBe("scheduled");
    expect(getStatus("2026-08-29", false, false, "7", TODAY)).toBe("upcoming");
  });
});

describe("getUpcomingDays", () => {
  it("counts remaining days in the month for currentMonth", () => {
    expect(getUpcomingDays("currentMonth", "2026-08-22")).toBe(9);
    expect(getUpcomingDays("currentMonth", "2026-08-31")).toBe(0);
  });

  it("uses the length of this calendar month for oneMonth", () => {
    expect(getUpcomingDays("oneMonth", "2026-08-22")).toBe(31);
    expect(getUpcomingDays("oneMonth", "2026-02-01")).toBe(28);
  });
});
