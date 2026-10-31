import type { JobDates, LifeEventDetail, ResidenceDates } from "@/lib/timeline/types";

const STAMP = new Date("2026-08-13T12:00:00Z");

/** A Timeline event: Biscuit's adoption unless `overrides` says otherwise. */
export function lifeEvent(overrides: Partial<LifeEventDetail> = {}): LifeEventDetail {
  return {
    id: "e1",
    eventDate: "2010-05-04",
    title: "Adopted Biscuit",
    category: "Pets",
    notes: "",
    createdAt: STAMP,
    updatedAt: STAMP,
    ...overrides,
  };
}

/** A finished job, 2019-03-01 to 2022-06-30. */
export function jobDates(overrides: Partial<JobDates> = {}): JobDates {
  return {
    id: "j1",
    employer: "Acme Corp",
    jobTitle: "Software Engineer",
    startDate: "2019-03-01",
    endDate: "2022-06-30",
    ...overrides,
  };
}

/** A past residence in Seoul, 2014-08-01 to 2017-02-15. */
export function residenceDates(
  overrides: Partial<ResidenceDates> = {},
): ResidenceDates {
  return {
    id: "r1",
    label: "",
    streetAddress: "12 Sejong-daero",
    extendedAddress: "",
    city: "Seoul",
    region: "",
    postalCode: "04524",
    country: "South Korea",
    movedIn: "2014-08-01",
    movedOut: "2017-02-15",
    ...overrides,
  };
}
