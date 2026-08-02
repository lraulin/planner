import type { AppointmentCheck, NodeItemKind, NoteFlag, ShowAs } from "@/db/schema";
import { boolField, decodeDateTime, decodePriority, intField } from "./encodings";
import { tableRows } from "./parseXml";
import { rtfToPlainText } from "./rtf";
import type { AchDocument, AchPriority } from "./types";

/** Tables handled by the extras pass (not outline nodes). */
export const EXTRAS_TABLES = new Set([
  "Appointments",
  "AppointmentRecurrence",
  "TimeCharts",
  "TimeChartAreas",
  "LabelData",
  "Wishes",
  "NoteItems",
  "Metrics",
  "MetricTracking",
]);

export type MappedAppointment = {
  achId: string;
  subject: string;
  location: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  checkState: AppointmentCheck;
  reminderMinutes: number | null;
  showAs: ShowAs;
  priority: AchPriority;
  projectAchId: string | null;
  notes: string;
  private: boolean;
};

export type MappedTimeChart = {
  achId: string;
  name: string;
  areas: MappedTimeChartArea[];
};

export type MappedTimeChartArea = {
  achId: string;
  name: string;
  resultAreaAchId: string | null;
  /** 0=Sun … 6=Sat (JS / Achieve Weekday). */
  daysOfWeek: number[];
  startMinute: number;
  durationMinutes: number;
  backColor: string;
  foreColor: string;
  description: string;
};

export type MappedWish = {
  achId: string;
  resultAreaAchId: string | null;
  kind: NodeItemKind;
  title: string;
  description: string;
  purpose: string;
  priority: AchPriority;
  ordinal: number;
};

export type MappedNote = {
  achId: string;
  parentAchId: string | null;
  title: string;
  subject: string;
  body: string;
  noteDate: Date | null;
  flag: NoteFlag;
  collapsed: boolean;
  ordinal: number;
};

export type MappedMetric = {
  achId: string;
  /** Goal/Dream Achieve GUID when associated; null = standalone. */
  ownerAchId: string | null;
  title: string;
  category: string;
  question: string;
  description: string;
  reason: string;
  units: string;
  active: boolean;
  priority: AchPriority;
  metricType: string;
  objectiveTarget: number | null;
  ordinal: number;
};

export type MappedMetricEntry = {
  achId: string;
  metricAchId: string;
  entryDate: string;
  entryType: string;
  target: number | null;
  value: number;
};

export type AchExtrasMap = {
  appointments: MappedAppointment[];
  timeCharts: MappedTimeChart[];
  wishes: MappedWish[];
  notes: MappedNote[];
  metrics: MappedMetric[];
  metricEntries: MappedMetricEntry[];
  warnings: string[];
};

const WISH_KINDS: NodeItemKind[] = [
  "wish_want_dont_have",
  "wish_dont_want_have",
  "wish_want_have",
  "wish_want_avoid",
];

/** CSS / .NET color names Achieve uses on LabelData → hex for time-chart areas. */
const COLOR_HEX: Record<string, string> = {
  crimson: "#dc143c",
  deepskyblue: "#00bfff",
  lightgreen: "#90ee90",
  silver: "#c0c0c0",
  sandybrown: "#f4a460",
  lightblue: "#add8e6",
  darkkhaki: "#bdb76b",
  plum: "#dda0dd",
  seagreen: "#2e8b57",
  khaki: "#f0e68c",
  pink: "#ffc0cb",
  black: "#000000",
  white: "#ffffff",
  lightcoral: "#f08080",
  transparent: "#c8e0f0",
  red: "#ff0000",
  blue: "#0000ff",
  green: "#008000",
  yellow: "#ffff00",
  orange: "#ffa500",
  purple: "#800080",
  gray: "#808080",
  grey: "#808080",
  navy: "#000080",
  teal: "#008080",
  olive: "#808000",
  maroon: "#800000",
  aqua: "#00ffff",
  fuchsia: "#ff00ff",
  lime: "#00ff00",
};

/**
 * Map calendar, time-chart, wish-list, and notes tables from a Full XML dump.
 * Pure — does not touch the database. Outline GUIDs are left as Achieve ids for the
 * writer to resolve against the node id map.
 */
export function mapExtras(doc: AchDocument): AchExtrasMap {
  const warnings: string[] = [];
  const labelColor = new Map<string, string>();
  for (const row of tableRows(doc, "LabelData")) {
    const id = row.LabelDataId;
    if (!id) continue;
    const name = (row.ColorName ?? "").trim().toLowerCase();
    labelColor.set(id, COLOR_HEX[name] ?? "#c8e0f0");
  }

  const appointments = mapAppointments(doc, warnings);
  const timeCharts = mapTimeCharts(doc, labelColor, warnings);
  const wishes = mapWishes(doc, warnings);
  const notes = mapNotes(doc, warnings);
  const metrics = mapMetrics(doc, warnings);
  const metricEntries = mapMetricEntries(doc, warnings);

  return {
    appointments,
    timeCharts,
    wishes,
    notes,
    metrics,
    metricEntries,
    warnings,
  };
}

function mapAppointments(doc: AchDocument, warnings: string[]): MappedAppointment[] {
  const out: MappedAppointment[] = [];
  for (const row of tableRows(doc, "Appointments")) {
    const achId = row.AppointmentId;
    if (!achId) {
      warnings.push("Appointments row missing AppointmentId; skipped");
      continue;
    }
    const startAt = decodeDateTime(row.StartDateTime);
    const endAt = decodeDateTime(row.EndDateTime);
    if (!startAt || !endAt) {
      warnings.push(`Appointment ${achId} missing start/end; skipped`);
      continue;
    }
    const hasReminder = boolField(row, "HasReminder", false);
    const reminder = intField(row, "ReminderTime");
    out.push({
      achId,
      subject: row.Subject ?? "",
      location: row.Location ?? "",
      startAt,
      endAt,
      allDay: boolField(row, "IsAllDayEvent", false),
      checkState: decodeCheckState(intField(row, "CompletionState")),
      reminderMinutes: hasReminder ? (reminder ?? 15) : null,
      showAs: decodeShowAs(intField(row, "ShowTimeAs")),
      priority: decodePriority(intField(row, "Priority")),
      projectAchId: emptyToNull(row.ProjectId),
      notes: rtfToPlainText(row.Notes),
      private: boolField(row, "IsPrivate", false),
    });
  }
  return out;
}

function mapTimeCharts(
  doc: AchDocument,
  labelColor: Map<string, string>,
  warnings: string[],
): MappedTimeChart[] {
  const charts = tableRows(doc, "TimeCharts")
    .map((row) => ({
      achId: row.TimeChartId ?? "",
      name: row.Name ?? "Time Chart",
    }))
    .filter((c) => c.achId);

  // Achieve stores one area row per weekday; we collapse same name/time/duration into
  // multi-day areas.
  type Key = string;
  type Acc = {
    chartAchId: string;
    achIds: string[];
    name: string;
    resultAreaAchId: string | null;
    days: Set<number>;
    startMinute: number;
    durationMinutes: number;
    backColor: string;
    description: string;
    ordinal: number;
  };
  const groups = new Map<Key, Acc>();

  for (const row of tableRows(doc, "TimeChartAreas")) {
    const areaId = row.TimeChartAreaId;
    const chartId = row.TimeChartId;
    if (!areaId || !chartId) {
      warnings.push("TimeChartAreas row missing ids; skipped");
      continue;
    }
    // Use wall-clock HH:MM from the string — do not convert through Date local TZ.
    const startMinute = minutesFromIsoWallClock(row.StartTime);
    if (startMinute === null) {
      warnings.push(`TimeChartArea ${areaId} missing StartTime; skipped`);
      continue;
    }
    const durationMinutes = parseIsoDurationMinutes(row.Duration) ?? 60;
    const weekday = intField(row, "Weekday");
    if (weekday === null || weekday < 0 || weekday > 6) {
      warnings.push(`TimeChartArea ${areaId} bad Weekday; skipped`);
      continue;
    }
    const name = row.Text ?? "";
    const key = `${chartId}|${name}|${startMinute}|${durationMinutes}`;
    let acc = groups.get(key);
    if (!acc) {
      acc = {
        chartAchId: chartId,
        achIds: [],
        name,
        resultAreaAchId: emptyToNull(row.ResultAreaId),
        days: new Set(),
        startMinute,
        durationMinutes,
        backColor: labelColor.get(row.LabelDataId ?? "") ?? "#c8e0f0",
        description: row.Description ?? "",
        ordinal: intField(row, "__ORDINAL__") ?? 0,
      };
      groups.set(key, acc);
    }
    acc.achIds.push(areaId);
    acc.days.add(weekday);
    if (!acc.resultAreaAchId) acc.resultAreaAchId = emptyToNull(row.ResultAreaId);
  }

  const byChart = new Map<string, MappedTimeChartArea[]>();
  for (const acc of groups.values()) {
    const list = byChart.get(acc.chartAchId) ?? [];
    const firstId = acc.achIds[0];
    if (!firstId) continue;
    list.push({
      achId: firstId,
      name: acc.name,
      resultAreaAchId: acc.resultAreaAchId,
      daysOfWeek: [...acc.days].sort((a, b) => a - b),
      startMinute: acc.startMinute,
      durationMinutes: acc.durationMinutes,
      backColor: acc.backColor,
      foreColor: "#1b1d23",
      description: acc.description,
    });
    byChart.set(acc.chartAchId, list);
  }

  return charts.map((c) => ({
    achId: c.achId,
    name: c.name,
    areas: byChart.get(c.achId) ?? [],
  }));
}

function mapWishes(doc: AchDocument, warnings: string[]): MappedWish[] {
  const out: MappedWish[] = [];
  for (const row of tableRows(doc, "Wishes")) {
    const achId = row.WishId;
    if (!achId) {
      warnings.push("Wishes row missing WishId; skipped");
      continue;
    }
    const type = intField(row, "Type") ?? 0;
    const kind = WISH_KINDS[type] ?? "wish_want_dont_have";
    out.push({
      achId,
      resultAreaAchId: emptyToNull(row.ResultAreaId),
      kind,
      title: row.Title ?? "",
      description: row.Description ?? "",
      purpose: row.Purpose ?? "",
      priority: decodePriority(intField(row, "Priority")),
      ordinal: intField(row, "__ORDINAL__") ?? 0,
    });
  }
  return out;
}

function mapNotes(doc: AchDocument, warnings: string[]): MappedNote[] {
  const out: MappedNote[] = [];
  for (const row of tableRows(doc, "NoteItems")) {
    const achId = row.NoteItemId;
    if (!achId) {
      warnings.push("NoteItems row missing NoteItemId; skipped");
      continue;
    }
    const body = (row.NoteText ?? "").trim() || rtfToPlainText(row.Notes);
    out.push({
      achId,
      parentAchId: emptyToNull(row.ParentNoteId),
      title: row.Title ?? "",
      subject: row.Subject ?? "General",
      body,
      noteDate: decodeDateTime(row.Date),
      flag: decodeNoteFlag(intField(row, "Flag")),
      collapsed: !boolField(row, "Expanded", true),
      ordinal: intField(row, "__ORDINAL__") ?? 0,
    });
  }
  return out;
}

/**
 * Achieve Metrics table → our metrics rows.
 * Owner may be GoalId, DreamId, or OwnerId (best-effort field names).
 */
function mapMetrics(doc: AchDocument, warnings: string[]): MappedMetric[] {
  const out: MappedMetric[] = [];
  for (const row of tableRows(doc, "Metrics")) {
    const achId = row.MetricId;
    if (!achId) {
      warnings.push("Metrics row missing MetricId; skipped");
      continue;
    }
    const ownerAchId =
      emptyToNull(row.GoalId) ??
      emptyToNull(row.DreamId) ??
      emptyToNull(row.OwnerId) ??
      emptyToNull(row.ParentId);
    const targetRaw =
      row.ObjectiveTarget ?? row.TargetValue ?? row.Target ?? row.Objective;
    out.push({
      achId,
      ownerAchId,
      title: row.Title ?? row.Name ?? "",
      category: row.Category ?? "",
      question: row.Question ?? "",
      description: rtfToPlainText(row.Description) || (row.Description ?? ""),
      reason: rtfToPlainText(row.Reason) || (row.Reason ?? ""),
      units: row.Units ?? row.Unit ?? "",
      active: boolField(row, "Active", true),
      priority: decodePriority(intField(row, "Priority")),
      metricType: decodeMetricType(intField(row, "Type") ?? row.MetricType),
      objectiveTarget: parseLooseNumber(targetRaw),
      ordinal: intField(row, "__ORDINAL__") ?? 0,
    });
  }
  return out;
}

function mapMetricEntries(doc: AchDocument, warnings: string[]): MappedMetricEntry[] {
  const out: MappedMetricEntry[] = [];
  for (const row of tableRows(doc, "MetricTracking")) {
    const achId = row.MetricTrackingId ?? row.TrackingId ?? row.Id;
    const metricAchId = row.MetricId;
    if (!metricAchId) {
      warnings.push("MetricTracking row missing MetricId; skipped");
      continue;
    }
    const entryDate = parseEntryDateKey(row.Date ?? row.EntryDate ?? row.TrackingDate);
    if (!entryDate) {
      warnings.push(`MetricTracking ${achId ?? "?"} missing Date; skipped`);
      continue;
    }
    const value = parseLooseNumber(row.Value ?? row.TrackingValue);
    if (value === null) {
      warnings.push(`MetricTracking ${achId ?? metricAchId} missing Value; skipped`);
      continue;
    }
    out.push({
      achId: achId ?? `${metricAchId}:${entryDate}:${value}`,
      metricAchId,
      entryDate,
      entryType: decodeMetricEntryType(intField(row, "Type") ?? row.EntryType),
      target: parseLooseNumber(row.Target ?? row.TargetValue),
      value,
    });
  }
  return out;
}

/** Prefer the calendar YYYY-MM-DD written in the dump (avoid TZ shift via Date). */
function parseEntryDateKey(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(text.trim());
  if (m?.[1]) return m[1];
  const d = decodeDateTime(text);
  if (!d) return null;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function decodeMetricType(raw: number | string | null | undefined): string {
  if (raw === null || raw === undefined || raw === "") return "total";
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    if (s === "total" || s === "0") return "total";
    return s || "total";
  }
  // 0 = Total in Achieve (observed convention for similar type enums).
  if (raw === 0) return "total";
  return String(raw);
}

function decodeMetricEntryType(raw: number | string | null | undefined): string {
  if (raw === null || raw === undefined || raw === "") return "new_total";
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s || s === "0" || /^new\s*total$/i.test(s)) return "new_total";
    return s;
  }
  if (raw === 0) return "new_total";
  return String(raw);
}

function parseLooseNumber(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(String(raw).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** ShowTimeAs: 0 free, 1 busy, 2 tentative, 3 out of office (observed + Outlook-like). */
export function decodeShowAs(code: number | null | undefined): ShowAs {
  if (code === 0) return "free";
  if (code === 2) return "tentative";
  if (code === 3) return "out_of_office";
  return "busy";
}

/** CompletionState: 0 open, 1 done, 2 missed. */
export function decodeCheckState(code: number | null | undefined): AppointmentCheck {
  if (code === 1) return "done";
  if (code === 2) return "missed";
  return "open";
}

/** Flag: 0 none, 1 done, then colour indices (best-effort). */
export function decodeNoteFlag(code: number | null | undefined): NoteFlag {
  if (code === 1) return "done";
  if (code === 2) return "blue";
  if (code === 3) return "cyan";
  if (code === 4) return "green";
  if (code === 5) return "yellow";
  if (code === 6) return "orange";
  if (code === 7) return "red";
  if (code === 8) return "purple";
  return "none";
}

/** Parse ISO-8601 duration like PT30M, PT1H30M, PT8H. */
export function parseIsoDurationMinutes(
  text: string | null | undefined,
): number | null {
  if (!text) return null;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(text.trim());
  if (!m) return null;
  const hours = Number(m[1] ?? 0);
  const mins = Number(m[2] ?? 0);
  const secs = Number(m[3] ?? 0);
  const total = hours * 60 + mins + Math.round(secs / 60);
  return total > 0 ? total : null;
}

/** Minutes from midnight using the HH:MM written in an ISO timestamp (ignore TZ offset). */
export function minutesFromIsoWallClock(
  text: string | null | undefined,
): number | null {
  if (!text) return null;
  const m = /T(\d{2}):(\d{2})/.exec(text);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function emptyToNull(value: string | undefined): string | null {
  if (!value || !value.trim()) return null;
  return value;
}
