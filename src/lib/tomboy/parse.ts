import { tomboyToMarkdown, tomboyXmlText } from "./markup";
import { fromDateKey } from "@/lib/schedule/geometry";

export type TomboyFile = {
  name: string;
  text: string;
};

export type ParsedTomboyNote = {
  sourceId: string;
  title: string;
  body: string;
  contexts: string[];
  /** Tomboy's creation calendar day, for Planner's visible note Date field. */
  noteDate: Date;
  createdAt: Date;
  updatedAt: Date;
  isTemplate: boolean;
  unknownMarkup: string[];
};

const NOTE_ID_RE =
  /(?:^|[/\\])([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.note$/i;

export function tomboyIdFromFilename(filename: string): string | null {
  return NOTE_ID_RE.exec(filename)?.[1]?.toLowerCase() ?? null;
}

/** Parse one Tomboy 0.3 `.note` XML file into Planner-ready values. */
export function parseTomboyNote(file: TomboyFile): ParsedTomboyNote {
  const sourceId = tomboyIdFromFilename(file.name);
  if (!sourceId) throw new Error("filename is not a Tomboy UUID .note file");

  const xml = file.text.replace(/^\uFEFF/, "");
  if (
    !/<note\b[^>]*xmlns=(?:"|')http:\/\/beatniksoftware\.com\/tomboy(?:"|')/i.test(xml)
  ) {
    throw new Error("missing Tomboy <note> root");
  }

  const title = scalar(xml, "title").trim();
  if (title === "") throw new Error("missing note title");

  const content = elementBody(xml, "note-content");
  if (content === null) throw new Error("missing <note-content>");
  const converted = tomboyToMarkdown(content);

  const createdValue = scalar(xml, "create-date").trim();
  const createdAt = instant(createdValue, "create-date");
  const noteDate = calendarDay(createdValue, "create-date");
  const changedAt = optionalInstant(xml, "last-change-date") ?? createdAt;
  const metadataChangedAt =
    optionalInstant(xml, "last-metadata-change-date") ?? changedAt;
  const updatedAt = changedAt > metadataChangedAt ? changedAt : metadataChangedAt;

  const tags = allScalars(elementBody(xml, "tags") ?? "", "tag")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const contexts = unique(
    tags.flatMap((tag) => {
      const notebookPrefix = "system:notebook:";
      if (tag.startsWith(notebookPrefix))
        return [tag.slice(notebookPrefix.length).trim()];
      if (!tag.startsWith("system:")) return [tag];
      return [];
    }),
  );

  return {
    sourceId,
    title,
    body: removeDuplicatedTitle(converted.markdown, title),
    contexts,
    noteDate,
    createdAt,
    updatedAt,
    isTemplate: tags.includes("system:template"),
    unknownMarkup: converted.unknownTags,
  };
}

function calendarDay(value: string, field: string): Date {
  const match = /^(\d{4}-\d{2}-\d{2})T/.exec(value);
  if (!match) throw new Error(`invalid <${field}> timestamp`);
  return fromDateKey(match[1]);
}

function elementBody(xml: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i").exec(
    xml,
  );
  return match?.[1] ?? null;
}

function scalar(xml: string, name: string): string {
  const body = elementBody(xml, name);
  if (body === null) return "";
  return tomboyXmlText(body);
}

function allScalars(xml: string, name: string): string[] {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "gi");
  return Array.from(xml.matchAll(pattern), (match) => tomboyXmlText(match[1]));
}

function optionalInstant(xml: string, name: string): Date | null {
  const value = scalar(xml, name).trim();
  return value === "" ? null : instant(value, name);
}

function instant(value: string, field: string): Date {
  const date = new Date(value.trim());
  if (Number.isNaN(date.getTime())) throw new Error(`invalid <${field}> timestamp`);
  return date;
}

function removeDuplicatedTitle(body: string, title: string): string {
  const newline = body.indexOf("\n");
  const firstLine = (newline < 0 ? body : body.slice(0, newline)).trim();
  if (firstLine !== title.trim()) return body.trim();
  return (newline < 0 ? "" : body.slice(newline + 1)).replace(/^\n+/, "").trim();
}

function unique(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (value === "" || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}
