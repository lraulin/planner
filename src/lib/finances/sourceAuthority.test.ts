import { describe, expect, it } from "vitest";
import {
  isDated,
  isStrictlyNewer,
  pickAuthoritative,
  type SourceCandidate,
  type SourceStamp,
} from "./sourceAuthority";

const at = (iso: string): SourceStamp => ({ asOf: new Date(iso), asOfDay: null });
const day = (key: string): SourceStamp => ({ asOf: null, asOfDay: key });
const undated: SourceStamp = { asOf: null, asOfDay: null };

describe("isDated", () => {
  it("treats a stamp with neither instant nor day as undated", () => {
    expect(isDated(undated)).toBe(false);
    expect(isDated(null)).toBe(false);
    expect(isDated(at("2026-09-01T10:00:00Z"))).toBe(true);
    expect(isDated(day("2026-09-01"))).toBe(true);
  });
});

describe("isStrictlyNewer", () => {
  it("compares two instants as instants, not as days", () => {
    expect(
      isStrictlyNewer(at("2026-09-01T18:00:00Z"), at("2026-09-01T09:00:00Z")),
    ).toBe(true);
    expect(
      isStrictlyNewer(at("2026-09-01T09:00:00Z"), at("2026-09-01T18:00:00Z")),
    ).toBe(false);
  });

  it("compares two day-only stamps as day keys", () => {
    expect(isStrictlyNewer(day("2026-09-02"), day("2026-09-01"))).toBe(true);
    expect(isStrictlyNewer(day("2026-08-31"), day("2026-09-01"))).toBe(false);
  });

  it("reduces an instant to its day when the other side only knows a day", () => {
    // 2026-09-02T02:00Z is 2026-09-01 in the pinned Eastern zone but 09-02 by `toDateKey`,
    // which reads UTC components. The rule must not depend on the process zone.
    expect(isStrictlyNewer(at("2026-09-02T02:00:00Z"), day("2026-09-01"))).toBe(true);
    expect(isStrictlyNewer(day("2026-09-02"), at("2026-09-01T23:00:00Z"))).toBe(true);
  });

  it("keeps the incumbent on a same-day tie between an instant and a day", () => {
    // The whole point of strictly-newer: no local end-of-day is invented, so a file dated
    // 2026-09-01 cannot displace a capture made at any hour of 2026-09-01, either way round.
    expect(isStrictlyNewer(day("2026-09-01"), at("2026-09-01T00:30:00Z"))).toBe(false);
    expect(isStrictlyNewer(at("2026-09-01T23:30:00Z"), day("2026-09-01"))).toBe(false);
  });

  it("keeps the incumbent on an exact instant tie", () => {
    expect(
      isStrictlyNewer(at("2026-09-01T09:00:00Z"), at("2026-09-01T09:00:00Z")),
    ).toBe(false);
  });

  it("never lets an undated stamp beat a dated one", () => {
    expect(isStrictlyNewer(undated, day("2020-01-01"))).toBe(false);
    expect(isStrictlyNewer(null, at("2020-01-01T00:00:00Z"))).toBe(false);
  });

  it("lets any dated stamp beat an undated incumbent", () => {
    expect(isStrictlyNewer(day("2020-01-01"), undated)).toBe(true);
    expect(isStrictlyNewer(at("2020-01-01T00:00:00Z"), null)).toBe(true);
  });

  it("does not displace one undated stamp with another", () => {
    expect(isStrictlyNewer(undated, undated)).toBe(false);
  });
});

describe("pickAuthoritative", () => {
  const entries = (
    map: Partial<Record<"feed" | "browser" | "file", SourceStamp>>,
  ): SourceCandidate<string>[] =>
    (Object.entries(map) as [SourceCandidate<string>["source"], SourceStamp][]).map(
      ([source, stamp]) => ({ source, stamp, value: source }),
    );

  it("returns null when nothing has reported", () => {
    expect(pickAuthoritative([], "feed")).toBeNull();
  });

  it("picks the freshest stamp regardless of which source holds the headline", () => {
    const picked = pickAuthoritative(
      entries({
        feed: at("2026-08-30T12:00:00Z"),
        browser: at("2026-09-01T08:00:00Z"),
      }),
      "feed",
    );
    expect(picked?.source).toBe("browser");
  });

  it("keeps the incumbent when a stale source reports again", () => {
    // A re-pasted snapshot from before the last sync: its own row moves, the headline does not.
    const picked = pickAuthoritative(
      entries({
        feed: at("2026-09-01T08:00:00Z"),
        browser: at("2026-08-30T12:00:00Z"),
      }),
      "browser",
    );
    expect(picked?.source).toBe("feed");
  });

  it("keeps the incumbent over an equally current rival", () => {
    const stamp = at("2026-09-01T08:00:00Z");
    expect(
      pickAuthoritative(entries({ feed: stamp, browser: stamp }), "browser")?.source,
    ).toBe("browser");
    expect(
      pickAuthoritative(entries({ feed: stamp, browser: stamp }), "feed")?.source,
    ).toBe("feed");
  });

  it("falls back to the provider of record when nothing holds the headline yet", () => {
    const stamp = at("2026-09-01T08:00:00Z");
    expect(
      pickAuthoritative(entries({ file: stamp, browser: stamp, feed: stamp }), null)
        ?.source,
    ).toBe("feed");
  });

  it("chooses a dated source over an undated one whatever the order", () => {
    const picked = pickAuthoritative(
      [
        { source: "feed", stamp: undated, value: "feed" },
        { source: "file", stamp: day("2026-08-01"), value: "file" },
      ],
      "feed",
    );
    expect(picked?.source).toBe("file");
  });

  const sep12File = day("2026-09-12");
  const sep12Feed = at("2026-09-12T22:18:00Z");

  it("keeps the incumbent on a same-day file/feed tie when neither side offers evidence", () => {
    // The D2 mixed-precision rule, and the Sep 12 bug: without the file's Apple rows
    // being weighed, SimpleFIN's $0.00 at 6:18 PM stays and Ready to Assign invents $5.19.
    expect(
      pickAuthoritative(
        [
          { source: "feed", stamp: sep12Feed, value: "feed" },
          { source: "file", stamp: sep12File, value: "file" },
        ],
        "feed",
      )?.source,
    ).toBe("feed");
  });

  it("lets the file win a same-day tie when only the file holds posted rows that day", () => {
    expect(
      pickAuthoritative(
        [
          {
            source: "feed",
            stamp: sep12Feed,
            value: "feed",
            postedOnStampDay: false,
          },
          {
            source: "file",
            stamp: sep12File,
            value: "file",
            postedOnStampDay: true,
          },
        ],
        "feed",
      )?.source,
    ).toBe("file");
  });

  it("lets the feed win a same-day tie when only the feed holds posted rows that day", () => {
    expect(
      pickAuthoritative(
        [
          {
            source: "feed",
            stamp: sep12Feed,
            value: "feed",
            postedOnStampDay: true,
          },
          {
            source: "file",
            stamp: sep12File,
            value: "file",
            postedOnStampDay: false,
          },
        ],
        "file",
      )?.source,
    ).toBe("feed");
  });

  it("keeps the incumbent when both sources hold posted rows on the tied day", () => {
    expect(
      pickAuthoritative(
        [
          {
            source: "feed",
            stamp: sep12Feed,
            value: "feed",
            postedOnStampDay: true,
          },
          {
            source: "file",
            stamp: sep12File,
            value: "file",
            postedOnStampDay: true,
          },
        ],
        "feed",
      )?.source,
    ).toBe("feed");
  });

  it("keeps the incumbent when neither source holds posted rows on the tied day", () => {
    expect(
      pickAuthoritative(
        [
          {
            source: "feed",
            stamp: sep12Feed,
            value: "feed",
            postedOnStampDay: false,
          },
          {
            source: "file",
            stamp: sep12File,
            value: "file",
            postedOnStampDay: false,
          },
        ],
        "feed",
      )?.source,
    ).toBe("feed");
  });
});
