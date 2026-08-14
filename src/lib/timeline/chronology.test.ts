import { describe, expect, it } from "vitest";
import { deriveChronology, HOME_CATEGORY, WORK_CATEGORY } from "./chronology";
import type { LifeEventDetail } from "./types";

const NOW = new Date("2026-08-13T12:00:00Z");

function event(overrides: Partial<LifeEventDetail> = {}): LifeEventDetail {
  return {
    id: "e1",
    eventDate: "2010-05-04",
    title: "Adopted Biscuit",
    category: "Pets",
    notes: "",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function job(overrides: Partial<Parameters<typeof deriveChronology>[1][number]> = {}) {
  return {
    id: "j1",
    employer: "Acme Corp",
    jobTitle: "Software Engineer",
    startDate: "2019-03-01" as string | null,
    endDate: "2022-06-30" as string | null,
    ...overrides,
  };
}

function residence(
  overrides: Partial<Parameters<typeof deriveChronology>[2][number]> = {},
) {
  return {
    id: "r1",
    label: "",
    streetAddress: "12 Sejong-daero",
    extendedAddress: "",
    city: "Seoul",
    region: "",
    postalCode: "04524",
    country: "South Korea",
    movedIn: "2014-08-01" as string | null,
    movedOut: "2017-02-15" as string | null,
    ...overrides,
  };
}

describe("deriveChronology", () => {
  it("turns a completed job into two rows, not one span", () => {
    // The shaping decision this whole module exists to express: Timeline is a chronology of
    // points. Start and end are separate rows; the Jobs page is where they appear together.
    const rows = deriveChronology([], [job()], []);
    expect(rows).toEqual([
      expect.objectContaining({
        id: "job:j1:start",
        dateKey: "2019-03-01",
        title: "Started at Acme Corp",
        category: WORK_CATEGORY,
        notes: "Software Engineer",
        source: "job",
        sourceId: "j1",
      }),
      expect.objectContaining({
        id: "job:j1:end",
        dateKey: "2022-06-30",
        title: "Left Acme Corp",
      }),
    ]);
  });

  it("gives a current job one row, not two", () => {
    const rows = deriveChronology([], [job({ endDate: null })], []);
    expect(rows.map((row) => row.title)).toEqual(["Started at Acme Corp"]);
  });

  it("gives an undated job no rows at all", () => {
    // A half-filled job record must not appear in the chronology as a dateless row.
    const rows = deriveChronology([], [job({ startDate: null, endDate: null })], []);
    expect(rows).toEqual([]);
  });

  it("names a residence by its city and carries the full address as notes", () => {
    const rows = deriveChronology([], [], [residence()]);
    expect(rows).toEqual([
      expect.objectContaining({
        id: "residence:r1:in",
        dateKey: "2014-08-01",
        title: "Moved to Seoul",
        category: HOME_CATEGORY,
        notes: "12 Sejong-daero, Seoul, 04524, South Korea",
        source: "residence",
        sourceId: "r1",
      }),
      expect.objectContaining({ id: "residence:r1:out", title: "Left Seoul" }),
    ]);
  });

  it("falls back to the label, then to a placeholder, when there is no city", () => {
    const [withLabel] = deriveChronology(
      [],
      [],
      [residence({ city: "", label: "The cabin", movedOut: null })],
    );
    expect(withLabel.title).toBe("Moved to The cabin");

    const [bare] = deriveChronology(
      [],
      [],
      [residence({ city: "", label: "", movedOut: null })],
    );
    expect(bare.title).toBe("Moved to a new address");
  });

  it("names an employer-less job without producing 'Started at '", () => {
    const [row] = deriveChronology([], [job({ employer: "  ", endDate: null })], []);
    expect(row.title).toBe("Started at an unnamed employer");
  });

  it("keeps a life event's own title and free-text category", () => {
    const rows = deriveChronology([event()], [], []);
    expect(rows).toEqual([
      expect.objectContaining({
        id: "event:e1",
        dateKey: "2010-05-04",
        title: "Adopted Biscuit",
        category: "Pets",
        source: "event",
        sourceId: null,
      }),
    ]);
  });

  it("interleaves all three sources oldest first", () => {
    const rows = deriveChronology([event()], [job()], [residence()]);
    expect(rows.map((row) => row.dateKey)).toEqual([
      "2010-05-04", // adopted the dog
      "2014-08-01", // moved to Seoul
      "2017-02-15", // left Seoul
      "2019-03-01", // started at Acme
      "2022-06-30", // left Acme
    ]);
  });

  it("breaks a same-day tie by id so the order does not wobble between renders", () => {
    const rows = deriveChronology(
      [event({ id: "e9", eventDate: "2017-02-15" })],
      [],
      [residence()],
    );
    const sameDay = rows.filter((row) => row.dateKey === "2017-02-15");
    expect(sameDay.map((row) => row.id)).toEqual(["event:e9", "residence:r1:out"]);
  });
});
