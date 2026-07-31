import type { CapturedItem } from "@/lib/capture/parse";
import { AgentError } from "./errors";
import { optionalNullableString, optionalString, parseDate } from "./parse";

/**
 * Argument parsing for the `capture` tool, kept apart from the tool itself because it is
 * the only interesting part: everything downstream is one call to `captureItems`, while
 * this is where a malformed batch either gets rejected or quietly imports the wrong thing.
 *
 * Two accepted shapes, and it is worth being clear why there are two rather than one:
 *
 * - `{ name, note?, … }` — one item. Alfred posts this today and tool argument shapes are
 *   part of the agent contract, so it keeps working unchanged.
 * - `{ items: [ … ] }` — a batch, for the Apple Reminders drain. The alternative was N
 *   requests from inside a Shortcut's Repeat block, which on a phone means N chances to
 *   fail halfway through a list.
 */

/** How many items one call may carry. Generous for a neglected Reminders list, small
 * enough that a runaway client cannot ask us to write unbounded rows in one transaction. */
export const MAX_CAPTURE_ITEMS = 100;

export type ParsedCaptureArgs = {
  items: CapturedItem[];
  /**
   * True when the single-item form was used. The response shapes differ — the single form
   * answers with the node it made, which is what Alfred reads — so the caller has to know
   * which question was asked.
   */
  single: boolean;
};

export function parseCaptureArgs(args: Record<string, unknown>): ParsedCaptureArgs {
  const hasItems = args.items !== undefined;
  const hasName = args.name !== undefined;

  if (hasItems && hasName) {
    throw new AgentError(
      "validation",
      "Pass either name (one item) or items (a batch), not both",
    );
  }
  if (!hasItems && !hasName) {
    throw new AgentError("validation", "name or items is required");
  }

  // A source named once at the top level covers every item in the batch; one drain is one
  // source, and repeating it on all fifty items is noise.
  const batchSource = optionalString(args, "externalSource");

  if (!hasItems) {
    return { items: [parseItem(args, batchSource, null)], single: true };
  }

  const raw = args.items;
  if (!Array.isArray(raw)) {
    throw new AgentError("validation", "items must be an array");
  }
  if (raw.length === 0) {
    throw new AgentError("validation", "items must not be empty");
  }
  if (raw.length > MAX_CAPTURE_ITEMS) {
    throw new AgentError(
      "validation",
      `items must contain at most ${MAX_CAPTURE_ITEMS} entries (got ${raw.length})`,
    );
  }

  return {
    items: raw.map((entry, index) => {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        throw new AgentError("validation", `items[${index}] must be an object`);
      }
      return parseItem(entry as Record<string, unknown>, batchSource, index);
    }),
    single: false,
  };
}

/**
 * One item, from either form. `index` is null for the single-item form, where there is no
 * position to name; in a batch every message carries `items[n].` so a rejected drain of
 * forty reminders says which one was wrong.
 */
function parseItem(
  obj: Record<string, unknown>,
  batchSource: string | undefined,
  index: number | null,
): CapturedItem {
  const at = index === null ? "" : `items[${index}].`;
  const str = (key: string): string | undefined => {
    const value = obj[key];
    if (value === undefined || value === null) return undefined;
    if (typeof value !== "string") {
      throw new AgentError("validation", `${at}${key} must be a string`);
    }
    return value;
  };

  const name = str("name")?.trim() ?? "";
  if (name === "") {
    throw new AgentError("validation", `${at}name is required`);
  }

  const note = str("note")?.trim() ?? "";
  // Passed straight through, not via `?? undefined`: absent and explicitly-null are
  // different answers here — one means "no opinion", the other "no deadline".
  const deadline = parseDate(optionalNullableString(obj, "deadline"), `${at}deadline`);

  const externalId = str("externalId")?.trim();
  const externalSource = str("externalSource")?.trim() ?? batchSource;

  // An id with no source is not unique — `nodes_external_ref_uq` spans both columns, and
  // Postgres treats null sources as distinct from each other, so an unqualified id would
  // silently opt out of the dedupe it was sent to get. Refuse rather than half-honour it.
  if (externalId && !externalSource) {
    throw new AgentError(
      "validation",
      `${at}externalId requires externalSource (on the item or the request)`,
    );
  }

  return {
    depth: 0,
    name,
    note,
    ...(deadline !== undefined ? { deadline } : {}),
    ...(externalId && externalSource
      ? { external: { source: externalSource, id: externalId } }
      : {}),
  };
}
