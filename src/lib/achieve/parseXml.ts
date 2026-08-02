import type { AchDocument, AchRow } from "./types";

/**
 * Parse Achieve Full XML (`.achxml` / FileXMLDump) into tables of string fields.
 *
 * Uses the platform DOMParser in browsers and a minimal regex-free path via
 * `Linkedom`-less Node: we use the built-in approach of stripping the schema and walking
 * with a lightweight tag scanner so tests stay dependency-free.
 *
 * The embedded XSD is ignored for data extraction; only data rows under `<AchieveDB>` matter.
 */

const SKIP_TAGS = new Set(["xs:schema", "schema"]);

/**
 * Strip the embedded XSD block. Achieve always writes it first under AchieveDB when
 * WriteSchema is on; removing it keeps the rest as plain elements.
 */
export function stripSchema(xml: string): string {
  return xml.replace(/<xs:schema\b[\s\S]*?<\/xs:schema>\s*/i, "");
}

/**
 * Very small XML element walker for the DataSet dump shape: no attributes on data rows
 * (except none), text-only children, no namespaces on data elements.
 *
 * Not a general XML parser — it is deliberately strict about Achieve's output so a
 * corrupted file fails loudly rather than silently dropping half a tree.
 */
export function parseAchXml(xml: string): AchDocument {
  const stripped = stripSchema(xml);
  const rootOpen = stripped.match(/<AchieveDB\b[^>]*>/i);
  const rootClose = stripped.lastIndexOf("</AchieveDB>");
  if (!rootOpen || rootClose < 0) {
    throw new Error("Not an Achieve Full XML file: missing <AchieveDB> root");
  }

  const body = stripped.slice(rootOpen.index! + rootOpen[0].length, rootClose);
  const tables: Record<string, AchRow[]> = {};
  let majorDatabaseVersion: number | null = null;
  let databaseVersion: number | null = null;

  // Schema props sometimes survive only in the stripped-away block; try original.
  const major = xml.match(/msprop:MajorDatabaseVersion="(\d+)"/);
  const dbVer = xml.match(/msprop:DatabaseVersion="(\d+)"/);
  if (major) majorDatabaseVersion = Number(major[1]);
  if (dbVer) databaseVersion = Number(dbVer[1]);

  let i = 0;
  while (i < body.length) {
    const open = body.indexOf("<", i);
    if (open < 0) break;
    if (body.startsWith("</", open)) {
      i = open + 2;
      continue;
    }
    if (body.startsWith("<?", open) || body.startsWith("<!", open)) {
      const endDecl = body.indexOf(">", open);
      i = endDecl < 0 ? body.length : endDecl + 1;
      continue;
    }

    const tagMatch = /^<([A-Za-z_][\w.]*)\b([^>]*)>/.exec(body.slice(open));
    if (!tagMatch) {
      i = open + 1;
      continue;
    }

    const tag = tagMatch[1];
    const fullOpen = tagMatch[0];
    const selfClosing = /\/>$/.test(fullOpen) || /\/\s*>$/.test(tagMatch[2] ?? "");

    if (SKIP_TAGS.has(tag) || tag.includes(":")) {
      // Skip namespaced leftovers.
      if (selfClosing) {
        i = open + fullOpen.length;
        continue;
      }
      const close = body.indexOf(`</${tag}>`, open + fullOpen.length);
      i = close < 0 ? body.length : close + tag.length + 3;
      continue;
    }

    if (selfClosing) {
      i = open + fullOpen.length;
      continue;
    }

    const closeTag = `</${tag}>`;
    const close = findMatchingClose(body, open + fullOpen.length, tag);
    if (close < 0) {
      throw new Error(`Unclosed <${tag}> in Achieve XML`);
    }

    const inner = body.slice(open + fullOpen.length, close);
    // Top-level children of AchieveDB are table rows (or empty wrappers). A row has
    // field children, not nested table-named elements as the only content pattern —
    // but nested same-structure is fine: we treat every direct AchieveDB child element
    // whose name is a table as one row.
    if (!tables[tag]) tables[tag] = [];
    tables[tag].push(parseRow(inner));
    i = close + closeTag.length;
  }

  return { majorDatabaseVersion, databaseVersion, tables };
}

/** Find `</tag>` that matches this open, allowing nested same-named elements. */
function findMatchingClose(body: string, from: number, tag: string): number {
  const openPat = new RegExp(`<${tag}\\b`, "g");
  const closePat = new RegExp(`</${tag}>`, "g");
  openPat.lastIndex = from;
  closePat.lastIndex = from;
  let depth = 1;
  let pos = from;
  while (depth > 0 && pos < body.length) {
    openPat.lastIndex = pos;
    closePat.lastIndex = pos;
    const nextOpen = openPat.exec(body);
    const nextClose = closePat.exec(body);
    if (!nextClose) return -1;
    if (nextOpen && nextOpen.index < nextClose.index) {
      // Could be self-closing-ish; still count as open if not />
      const slice = body.slice(nextOpen.index, nextOpen.index + 200);
      const end = slice.indexOf(">");
      if (end >= 0 && slice[end - 1] !== "/") {
        depth++;
      }
      pos = nextOpen.index + 1;
    } else {
      depth--;
      if (depth === 0) return nextClose.index;
      pos = nextClose.index + 1;
    }
  }
  return -1;
}

function parseRow(inner: string): AchRow {
  const row: AchRow = {};
  let i = 0;
  while (i < inner.length) {
    const open = inner.indexOf("<", i);
    if (open < 0) break;
    if (inner.startsWith("</", open)) {
      i = open + 2;
      continue;
    }
    if (inner.startsWith("<?", open) || inner.startsWith("<!", open)) {
      const endDecl = inner.indexOf(">", open);
      i = endDecl < 0 ? inner.length : endDecl + 1;
      continue;
    }

    const tagMatch = /^<([A-Za-z_][\w.]*)\b([^>]*)>/.exec(inner.slice(open));
    if (!tagMatch) {
      i = open + 1;
      continue;
    }
    const field = tagMatch[1];
    const fullOpen = tagMatch[0];
    if (/\/>$/.test(fullOpen)) {
      row[field] = "";
      i = open + fullOpen.length;
      continue;
    }
    const close = inner.indexOf(`</${field}>`, open + fullOpen.length);
    if (close < 0) {
      // Nested junk — skip open tag.
      i = open + fullOpen.length;
      continue;
    }
    const raw = inner.slice(open + fullOpen.length, close);
    row[field] = decodeEntities(stripNestedTags(raw));
    i = close + field.length + 3;
  }
  return row;
}

/** Field bodies should be text; if nested markup slipped in, drop tags. */
function stripNestedTags(raw: string): string {
  if (!raw.includes("<")) return raw;
  return raw.replace(/<[^>]+>/g, "");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Convenience: rows for a table, or empty array. */
export function tableRows(doc: AchDocument, name: string): AchRow[] {
  return doc.tables[name] ?? [];
}
