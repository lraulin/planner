/**
 * Category picker tree — Budget page order (type, then nested groups and envelopes
 * alphabetically) plus a New {type}… sentinel in each section.
 *
 * Spec: `agent-os/specs/2026-08-26-1151-category-picker-typeahead/`.
 */

import type { EnvelopeKind } from "@/db/schema";
import { budgetChildren } from "./hierarchy";

export type EnvelopePickerOption = {
  id: string;
  label: string;
  name: string;
  kind: EnvelopeKind;
  groupId: string | null;
  sortKey: string;
  hidden: boolean;
};

export type EnvelopePickerGroup = {
  id: string;
  name: string;
  parentGroupId: string | null;
  sortKey: string;
  hidden: boolean;
};

/** What the picker needs to draw the Budget tree: the group rows plus the envelopes. */
export type EnvelopeCatalog = {
  groups: readonly EnvelopePickerGroup[];
  envelopes: readonly EnvelopePickerOption[];
};

export const CATEGORY_SECTIONS = [
  {
    kind: "income" as const,
    label: "Income",
    createValue: "__new__:income",
    createLabel: "New income…",
  },
  {
    kind: "spending" as const,
    label: "Regular spending",
    createValue: "__new__:spending",
    createLabel: "New envelope…",
  },
  {
    kind: "bill" as const,
    label: "Bills",
    createValue: "__new__:bill",
    createLabel: "New bill…",
  },
  {
    kind: "savings" as const,
    label: "Savings",
    createValue: "__new__:savings",
    createLabel: "New savings…",
  },
] as const;

export type CategorySection = (typeof CATEGORY_SECTIONS)[number];

export type CategoryPickerHeading = {
  kind: "heading";
  id: string;
  label: string;
  depth: number;
  /**
   * A type is not a group, and a budget can hold a group named "Income" sitting inside the
   * Income type. Without this the picker drew the two identically.
   */
  scope: "type" | "group";
};

export type CategoryPickerEnvelope = {
  kind: "envelope";
  id: string;
  label: string;
  depth: number;
};

export type CategoryPickerCreate = {
  kind: "create";
  id: string;
  label: string;
  envelopeKind: EnvelopeKind;
};

export type CategoryPickerRow =
  CategoryPickerHeading | CategoryPickerEnvelope | CategoryPickerCreate;

export type CategoryPickerSection = {
  section: CategorySection;
  rows: CategoryPickerRow[];
};

export type CategoryPickerChoice = CategoryPickerEnvelope | CategoryPickerCreate;

export function categoryPickerChoices(
  sections: readonly CategoryPickerSection[],
): CategoryPickerChoice[] {
  return sections.flatMap((entry) =>
    entry.rows.filter(
      (row): row is CategoryPickerChoice =>
        row.kind === "envelope" || row.kind === "create",
    ),
  );
}

/** First remaining envelope, or the first create row when no envelopes survive. */
export function defaultCategoryPickerChoice(
  choices: readonly CategoryPickerChoice[],
): number {
  const envelope = choices.findIndex((choice) => choice.kind === "envelope");
  if (envelope >= 0) return envelope;
  return choices.length > 0 ? 0 : -1;
}

export function commitCategoryPicker(
  draft: string,
  highlighted: CategoryPickerChoice | null,
  allowCreate: boolean,
):
  | { action: "clear" }
  | { action: "envelope"; id: string }
  | { action: "create"; envelopeKind: EnvelopeKind }
  | { action: "restore" } {
  if (draft.trim() === "") return { action: "clear" };
  if (!highlighted) return { action: "restore" };
  if (highlighted.kind === "create") {
    return allowCreate
      ? { action: "create", envelopeKind: highlighted.envelopeKind }
      : { action: "restore" };
  }
  return { action: "envelope", id: highlighted.id };
}

/**
 * Nested picker rows in Budget name order. Hidden envelopes and hidden-group
 * subtrees are omitted. Empty types stay so New {type}… is reachable. Filter is a
 * case-insensitive substring on envelope name, ancestor group names, and the type
 * label, and does not re-rank.
 */
export function categoryPickerSections(
  groups: readonly EnvelopePickerGroup[],
  envelopes: readonly EnvelopePickerOption[],
  query = "",
): CategoryPickerSection[] {
  const needle = query.trim().toLowerCase();
  const visibleGroups = groups.filter((group) => !group.hidden);
  const visibleGroupIds = new Set(visibleGroups.map((group) => group.id));
  const visibleEnvelopes = envelopes.filter(
    (envelope) =>
      !envelope.hidden &&
      (envelope.groupId === null || visibleGroupIds.has(envelope.groupId)),
  );
  const groupById = new Map(visibleGroups.map((group) => [group.id, group]));

  const sections: CategoryPickerSection[] = [];
  for (const section of CATEGORY_SECTIONS) {
    const ofKind = visibleEnvelopes.filter(
      (envelope) => envelope.kind === section.kind,
    );
    const typeMatches = matchesNeedle(section.label, needle);
    const matching = ofKind.filter(
      (envelope) =>
        typeMatches ||
        matchesNeedle(envelope.name, needle) ||
        ancestorNames(envelope.groupId, groupById).some((name) =>
          matchesNeedle(name, needle),
        ),
    );
    const showCreate = needle === "" || matchesNeedle(section.createLabel, needle);
    const tree = walkType(section.kind, visibleGroups, matching, groupById);
    if (tree.length === 0 && !showCreate) continue;

    const rows: CategoryPickerRow[] = [
      {
        kind: "heading",
        id: `type:${section.kind}`,
        label: section.label,
        depth: 0,
        scope: "type",
      },
      ...tree,
    ];
    if (showCreate) {
      rows.push({
        kind: "create",
        id: section.createValue,
        label: section.createLabel,
        envelopeKind: section.kind,
      });
    }
    sections.push({ section, rows });
  }
  return sections;
}

function matchesNeedle(value: string, needle: string): boolean {
  if (needle === "") return true;
  return value.toLowerCase().includes(needle);
}

function ancestorNames(
  groupId: string | null,
  groupById: Map<string, EnvelopePickerGroup>,
): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  let current = groupId ? groupById.get(groupId) : undefined;
  while (current) {
    if (seen.has(current.id)) throw new Error("Budget groups contain a cycle.");
    seen.add(current.id);
    names.push(current.name);
    current = current.parentGroupId ? groupById.get(current.parentGroupId) : undefined;
  }
  return names;
}

function walkType(
  typeKind: EnvelopeKind,
  groups: readonly EnvelopePickerGroup[],
  envelopes: readonly EnvelopePickerOption[],
  groupById: Map<string, EnvelopePickerGroup>,
): CategoryPickerRow[] {
  const rows: CategoryPickerRow[] = [];
  const emitted = new Set<string>();
  const envelopeById = new Map(envelopes.map((envelope) => [envelope.id, envelope]));

  function emitGroup(groupId: string, depth: number): number {
    if (emitted.has(groupId)) throw new Error("Budget groups contain a cycle.");
    const group = groupById.get(groupId);
    if (!group) return 0;
    emitted.add(groupId);

    const headerIndex = rows.length;
    rows.push({
      kind: "heading",
      id: `group:${typeKind}:${group.id}`,
      label: group.name,
      depth,
      scope: "group",
    });

    let count = 0;
    for (const child of budgetChildren(groups, envelopes, group.id)) {
      if (child.kind === "group") {
        count += emitGroup(child.id, depth + 1);
        continue;
      }
      const envelope = envelopeById.get(child.id);
      if (!envelope) continue;
      rows.push({
        kind: "envelope",
        id: envelope.id,
        label: envelope.name,
        depth: depth + 1,
      });
      count += 1;
    }

    if (count === 0) {
      rows.splice(headerIndex, 1);
      emitted.delete(groupId);
      return 0;
    }
    return count;
  }

  for (const root of budgetChildren(groups, envelopes, null)) {
    if (root.kind === "group") {
      emitGroup(root.id, 0);
      continue;
    }
    const envelope = envelopeById.get(root.id);
    if (!envelope) continue;
    rows.push({
      kind: "envelope",
      id: envelope.id,
      label: envelope.name,
      depth: 0,
    });
  }
  return rows;
}
