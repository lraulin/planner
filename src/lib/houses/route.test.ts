import { describe, expect, it } from "vitest";
import {
  addressKey,
  formatDriveTime,
  formatMiles,
  needsRoute,
  parseNominatim,
  parseOsrm,
} from "./route";

const ADDRESS = {
  streetAddress: "123 Main St",
  city: "Annapolis",
  state: "MD",
  postalCode: "21401",
};

describe("addressKey", () => {
  it("joins the parts, lowercased", () => {
    expect(addressKey(ADDRESS)).toBe("123 main st, annapolis, md 21401");
  });

  it("is stable under whitespace changes", () => {
    const padded = {
      streetAddress: "  123   Main St  ",
      city: " Annapolis ",
      state: "MD",
      postalCode: " 21401 ",
    };
    expect(addressKey(padded)).toBe(addressKey(ADDRESS));
  });

  it("is stable under case changes", () => {
    const shouted = { ...ADDRESS, city: "ANNAPOLIS", state: "md" };
    expect(addressKey(shouted)).toBe(addressKey(ADDRESS));
  });

  it("is empty when every part is blank", () => {
    expect(addressKey({ streetAddress: "", city: "", state: "", postalCode: "" })).toBe(
      "",
    );
  });

  it("is not empty when only some parts are blank", () => {
    expect(addressKey({ ...ADDRESS, city: "" })).not.toBe("");
  });
});

describe("needsRoute", () => {
  it("is true when the address key does not match the cached one", () => {
    expect(needsRoute({ ...ADDRESS, routedAddress: null })).toBe(true);
    expect(needsRoute({ ...ADDRESS, routedAddress: "stale" })).toBe(true);
  });

  it("is false once routedAddress matches the current key", () => {
    expect(needsRoute({ ...ADDRESS, routedAddress: addressKey(ADDRESS) })).toBe(false);
  });

  it("is false when the address is blank, even with no cached route", () => {
    const blank = {
      streetAddress: "",
      city: "",
      state: "",
      postalCode: "",
      routedAddress: null,
    };
    expect(needsRoute(blank)).toBe(false);
  });
});

describe("parseNominatim", () => {
  it("parses the first result's string lat/lon", () => {
    expect(parseNominatim([{ lat: "38.6301284", lon: "-76.5168522" }])).toEqual({
      lat: 38.6301284,
      lon: -76.5168522,
    });
  });

  it("returns null for an empty array", () => {
    expect(parseNominatim([])).toBeNull();
  });

  it("returns null when the response is not an array", () => {
    expect(parseNominatim({ error: "Unable to geocode" })).toBeNull();
  });

  it("returns null when lat/lon is missing or unparseable", () => {
    expect(parseNominatim([{ lat: "not a number", lon: "-76.5" }])).toBeNull();
    expect(parseNominatim([{ lon: "-76.5" }])).toBeNull();
  });
});

describe("parseOsrm", () => {
  it("parses and rounds distance/duration from routes[0]", () => {
    expect(
      parseOsrm({ code: "Ok", routes: [{ distance: 1234.6, duration: 987.2 }] }),
    ).toEqual({ meters: 1235, seconds: 987 });
  });

  it("returns null when routes is missing or empty", () => {
    expect(parseOsrm({ code: "Ok", routes: [] })).toBeNull();
    expect(parseOsrm({ code: "NoRoute" })).toBeNull();
  });

  it("returns null when distance/duration are not numbers", () => {
    expect(parseOsrm({ routes: [{ distance: "1234", duration: 987 }] })).toBeNull();
  });
});

describe("formatDriveTime", () => {
  it("formats under an hour as minutes", () => {
    expect(formatDriveTime(59.6)).toBe("1 min");
    expect(formatDriveTime(0)).toBe("0 min");
    expect(formatDriveTime(2520)).toBe("42 min");
  });

  it("formats an even hour without a trailing 0 min", () => {
    expect(formatDriveTime(3600)).toBe("1 hr");
  });

  it("carries a rounded 60 min into the next hour rather than printing '60 min'", () => {
    expect(formatDriveTime(3599.6)).toBe("1 hr");
  });

  it("formats hours and minutes together", () => {
    expect(formatDriveTime(3900)).toBe("1 hr 5 min");
  });
});

describe("formatMiles", () => {
  it("converts meters to miles with one decimal", () => {
    expect(formatMiles(37659)).toBe("23.4 mi");
  });

  it("formats zero", () => {
    expect(formatMiles(0)).toBe("0.0 mi");
  });
});
