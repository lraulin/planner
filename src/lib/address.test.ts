import { describe, expect, it } from "vitest";
import { formatPostalAddress } from "./address";

describe("formatPostalAddress", () => {
  it("skips blank parts so a city-only address is not ', London,'", () => {
    expect(
      formatPostalAddress({
        streetAddress: "",
        city: "London",
        region: "",
        postalCode: "",
        country: "",
      }),
    ).toBe("London");
  });

  it("joins city and region as one place before the rest", () => {
    expect(
      formatPostalAddress({
        streetAddress: "12 Baker St",
        extendedAddress: "Apt 3",
        city: "London",
        region: "Greater London",
        postalCode: "NW1 6XE",
        country: "United Kingdom",
      }),
    ).toBe("12 Baker St, Apt 3, London, Greater London, NW1 6XE, United Kingdom");
  });
});
