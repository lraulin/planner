import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { SLIM_CSV_FILES, type SlimCsvKind } from "./types";
import type { SlimTexts } from "./slim";

const WANTED = new Map<string, SlimCsvKind>(
  (Object.entries(SLIM_CSV_FILES) as [SlimCsvKind, string][]).map(([kind, name]) => [
    name.toLowerCase(),
    kind,
  ]),
);

/** Recursively collect the named CSVs from a folder. First match of each basename wins. */
export function textsFromDirectory(root: string): SlimTexts {
  const texts: SlimTexts = {};
  walk(root, texts);
  return texts;
}

function walk(dir: string, texts: SlimTexts): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, texts);
      continue;
    }
    if (!entry.isFile()) continue;
    const kind = WANTED.get(entry.name.toLowerCase());
    if (!kind || texts[kind]) continue;
    texts[kind] = readFileSync(full, "utf8");
  }
}

/**
 * Pull only the named CSVs out of a zip via `unzip -p`. JPEGs and PDFs stay in the archive.
 */
export function textsFromZip(zipPath: string): SlimTexts {
  const listed = spawnSync("unzip", ["-l", zipPath], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (listed.status !== 0) {
    throw new Error(listed.stderr.trim() || `unzip -l failed for ${zipPath}`);
  }

  const pathsByKind = new Map<SlimCsvKind, string>();
  for (const line of listed.stdout.split("\n")) {
    const name = zipListingName(line);
    if (!name) continue;
    const base = name.split("/").pop() ?? "";
    const kind = WANTED.get(base.toLowerCase());
    if (!kind || pathsByKind.has(kind)) continue;
    pathsByKind.set(kind, name);
  }

  const texts: SlimTexts = {};
  for (const [kind, pathInZip] of pathsByKind) {
    const extracted = spawnSync("unzip", ["-p", zipPath, pathInZip], {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
    if (extracted.status !== 0) {
      throw new Error(extracted.stderr.trim() || `unzip -p failed for ${pathInZip}`);
    }
    texts[kind] = extracted.stdout;
  }
  return texts;
}

/** Last column of `unzip -l` after the length/date/time prefix. */
export function zipListingName(line: string): string | null {
  const match = /^\s*\d+\s+\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}\s+(.+)$/.exec(line);
  if (!match) return null;
  const name = match[1].trim();
  return name && !name.endsWith("/") ? name : null;
}

export function loadSlimTexts(inputPath: string): SlimTexts {
  const stat = statSync(inputPath);
  if (stat.isDirectory()) return textsFromDirectory(inputPath);
  if (!/\.zip$/i.test(inputPath)) {
    throw new Error("Pass a Your Orders.zip file or an extracted folder.");
  }
  return textsFromZip(inputPath);
}
