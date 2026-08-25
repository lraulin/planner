import { describe, expect, it } from "vitest";
import { fromDateKey, localDateKey, toDateKey } from "@/lib/schedule/geometry";
import { dayString } from "./dates";

describe("dayString", () => {
  it("decodes a stored calendar field, not the wall-clock day of an instant", () => {
    expect(dayString(fromDateKey("2026-08-01"))).toBe("2026-08-01");

    // 9pm EDT is already 01:00Z the next day. Scoring a deadline with localDateKey
    // of that instant would treat it as due tomorrow. dayString must stay toDateKey.
    const evening = new Date(2026, 7, 25, 21, 0, 0);
    expect(localDateKey(evening)).toBe("2026-08-25");
    expect(toDateKey(evening)).toBe("2026-08-26");
    expect(dayString(evening)).toBe("2026-08-26");
  });
});
