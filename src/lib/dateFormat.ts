/**
 * Closed, English date formats for standalone calendar-day values.
 *
 * The ids deliberately use Excel's familiar date-token spelling, but they are presets —
 * not a custom-format language. Keeping the catalogue closed makes persisted values easy to
 * validate and keeps a date identical on the server, in every browser, and in every locale.
 */

export const DATE_FORMAT_OPTIONS = [
  { id: "M/D/YYYY", group: "Numeric" },
  { id: "M/D/YY", group: "Numeric" },
  { id: "MM/DD/YYYY", group: "Numeric" },
  { id: "MM/DD/YY", group: "Numeric" },
  { id: "D/M/YYYY", group: "Numeric" },
  { id: "D/M/YY", group: "Numeric" },
  { id: "DD/MM/YYYY", group: "Numeric" },
  { id: "DD/MM/YY", group: "Numeric" },
  { id: "YYYY-MM-DD", group: "Numeric" },
  { id: "YYYY/MM/DD", group: "Numeric" },
  { id: "MMM D, YYYY", group: "Written" },
  { id: "MMMM D, YYYY", group: "Written" },
  { id: "D MMM YYYY", group: "Written" },
  { id: "D MMMM YYYY", group: "Written" },
  { id: "D-MMM-YY", group: "Written" },
  { id: "D-MMM-YYYY", group: "Written" },
  { id: "DDD, MMM D, YYYY", group: "Written" },
  { id: "DDDD, MMMM D, YYYY", group: "Written" },
  { id: "M/D", group: "Partial" },
  { id: "MM/DD", group: "Partial" },
  { id: "D/M", group: "Partial" },
  { id: "DD/MM", group: "Partial" },
  { id: "MMM D", group: "Partial" },
  { id: "MMMM D", group: "Partial" },
  { id: "D MMM", group: "Partial" },
  { id: "D-MMM", group: "Partial" },
  { id: "MMM-YY", group: "Partial" },
  { id: "MMM YYYY", group: "Partial" },
  { id: "MMMM YYYY", group: "Partial" },
  { id: "DDD", group: "Partial" },
  { id: "DDDD", group: "Partial" },
] as const;

export type DateFormatId = (typeof DATE_FORMAT_OPTIONS)[number]["id"];
export type DateFormatGroup = (typeof DATE_FORMAT_OPTIONS)[number]["group"];

export const DEFAULT_DATE_FORMAT: DateFormatId = "M/D/YYYY";

const DATE_FORMAT_IDS: ReadonlySet<string> = new Set(
  DATE_FORMAT_OPTIONS.map((option) => option.id),
);

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEKDAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** `weekdayLongLabel(0) === "Sunday"` — the `weekdayOfDateKey` convention. */
export function weekdayLongLabel(weekday: number): string {
  return WEEKDAY_LONG[weekday] ?? String(weekday);
}

type DateParts = {
  year: number;
  month: number;
  day: number;
  year4: string;
  year2: string;
  month2: string;
  day2: string;
  monthShort: string;
  monthLong: string;
  weekdayShort: string;
  weekdayLong: string;
};

export function isDateFormatId(value: unknown): value is DateFormatId {
  return typeof value === "string" && DATE_FORMAT_IDS.has(value);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Gregorian weekday without constructing a local or UTC instant. */
function weekdayIndex(year: number, month: number, day: number): number {
  const offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4] as const;
  const adjustedYear = month < 3 ? year - 1 : year;
  return (
    (adjustedYear +
      Math.floor(adjustedYear / 4) -
      Math.floor(adjustedYear / 100) +
      Math.floor(adjustedYear / 400) +
      offsets[month - 1] +
      day) %
    7
  );
}

function parseDateKey(dateKey: string | null | undefined): DateParts | null {
  if (!dateKey) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  ) {
    return null;
  }

  const weekday = weekdayIndex(year, month, day);
  return {
    year,
    month,
    day,
    year4: match[1],
    year2: match[1].slice(2),
    month2: match[2],
    day2: match[3],
    monthShort: MONTH_SHORT[month - 1],
    monthLong: MONTH_LONG[month - 1],
    weekdayShort: WEEKDAY_SHORT[weekday],
    weekdayLong: WEEKDAY_LONG[weekday],
  };
}

/**
 * Format a canonical calendar-day key without parsing it as an instant.
 *
 * `format` accepts a string because persisted JSON is untrusted at runtime. An unknown
 * value uses the Achieve-compatible default in this one boundary rather than making every
 * caller remember a fallback.
 */
export function formatDateKey(
  dateKey: string | null | undefined,
  format: string | null | undefined = DEFAULT_DATE_FORMAT,
): string {
  const parts = parseDateKey(dateKey);
  if (!parts) return "";

  const selected = isDateFormatId(format) ? format : DEFAULT_DATE_FORMAT;
  const {
    year4,
    year2,
    month,
    month2,
    monthShort,
    monthLong,
    day,
    day2,
    weekdayShort,
    weekdayLong,
  } = parts;

  switch (selected) {
    case "M/D/YYYY":
      return `${month}/${day}/${year4}`;
    case "M/D/YY":
      return `${month}/${day}/${year2}`;
    case "MM/DD/YYYY":
      return `${month2}/${day2}/${year4}`;
    case "MM/DD/YY":
      return `${month2}/${day2}/${year2}`;
    case "D/M/YYYY":
      return `${day}/${month}/${year4}`;
    case "D/M/YY":
      return `${day}/${month}/${year2}`;
    case "DD/MM/YYYY":
      return `${day2}/${month2}/${year4}`;
    case "DD/MM/YY":
      return `${day2}/${month2}/${year2}`;
    case "YYYY-MM-DD":
      return `${year4}-${month2}-${day2}`;
    case "YYYY/MM/DD":
      return `${year4}/${month2}/${day2}`;
    case "MMM D, YYYY":
      return `${monthShort} ${day}, ${year4}`;
    case "MMMM D, YYYY":
      return `${monthLong} ${day}, ${year4}`;
    case "D MMM YYYY":
      return `${day} ${monthShort} ${year4}`;
    case "D MMMM YYYY":
      return `${day} ${monthLong} ${year4}`;
    case "D-MMM-YY":
      return `${day}-${monthShort}-${year2}`;
    case "D-MMM-YYYY":
      return `${day}-${monthShort}-${year4}`;
    case "DDD, MMM D, YYYY":
      return `${weekdayShort}, ${monthShort} ${day}, ${year4}`;
    case "DDDD, MMMM D, YYYY":
      return `${weekdayLong}, ${monthLong} ${day}, ${year4}`;
    case "M/D":
      return `${month}/${day}`;
    case "MM/DD":
      return `${month2}/${day2}`;
    case "D/M":
      return `${day}/${month}`;
    case "DD/MM":
      return `${day2}/${month2}`;
    case "MMM D":
      return `${monthShort} ${day}`;
    case "MMMM D":
      return `${monthLong} ${day}`;
    case "D MMM":
      return `${day} ${monthShort}`;
    case "D-MMM":
      return `${day}-${monthShort}`;
    case "MMM-YY":
      return `${monthShort}-${year2}`;
    case "MMM YYYY":
      return `${monthShort} ${year4}`;
    case "MMMM YYYY":
      return `${monthLong} ${year4}`;
    case "DDD":
      return weekdayShort;
    case "DDDD":
      return weekdayLong;
  }
}

/** Stable full-date tooltip for truncated and deliberately partial displays. */
export function formatFullDateKey(dateKey: string | null | undefined): string {
  return formatDateKey(dateKey, "DDDD, MMMM D, YYYY");
}
