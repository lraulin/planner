import { describe, expect, it } from "vitest";
import { namedFlow } from "./namedFlows";

describe("namedFlow", () => {
  it("files card interest and fees as a carrying cost", () => {
    expect(namedFlow("INTEREST CHARGE")).toBe("interest_fee");
    expect(namedFlow("ANNUAL MEMBERSHIP FEE")).toBe("interest_fee");
    expect(namedFlow("MONTHLY INTEREST PAID")).toBe("interest_fee");
  });

  it("names VA benefits as income so cadence detection cannot claim them", () => {
    expect(namedFlow("VACP TREAS 310 BENEFIT")).toBe("income");
  });

  it("files a checking withdrawal to PayPal as spend", () => {
    expect(namedFlow("PAYPAL TO LEE RAULIN")).toBe("spend");
  });

  it("leaves ordinary merchants to the detectors", () => {
    expect(namedFlow("WM SUPERCENTER")).toBeNull();
  });
});
