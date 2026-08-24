/**
 * Category picker groups — the same four sections the Budget page uses, plus a
 * New {type}… sentinel in each so a transaction can mint an envelope without leaving
 * the Register.
 *
 * Spec: `agent-os/specs/2026-08-24-1522-category-by-kind-and-history/` D1–D2.
 */

import type { EnvelopeKind } from "@/db/schema";

export type EnvelopePickerOption = {
  id: string;
  label: string;
  name: string;
  kind: EnvelopeKind;
};

export const CATEGORY_SECTIONS = [
  {
    kind: "income" as const,
    label: "Income",
    createValue: "__new__:income",
    createLabel: "New income…",
  },
  {
    kind: "bill" as const,
    label: "Bills",
    createValue: "__new__:bill",
    createLabel: "New bill…",
  },
  {
    kind: "spending" as const,
    label: "Regular spending",
    createValue: "__new__:spending",
    createLabel: "New envelope…",
  },
  {
    kind: "savings" as const,
    label: "Savings",
    createValue: "__new__:savings",
    createLabel: "New savings…",
  },
] as const;

export type CategorySection = (typeof CATEGORY_SECTIONS)[number];

export type GroupedEnvelopeOptions = {
  section: CategorySection;
  envelopes: EnvelopePickerOption[];
};

/** Empty groups stay: New {type}… has to be reachable even when the section has no rows. */
export function groupEnvelopeOptions(
  envelopes: readonly EnvelopePickerOption[],
): GroupedEnvelopeOptions[] {
  return CATEGORY_SECTIONS.map((section) => ({
    section,
    envelopes: envelopes.filter((envelope) => envelope.kind === section.kind),
  }));
}

export function parseNewEnvelopeKind(value: string): EnvelopeKind | null {
  const section = CATEGORY_SECTIONS.find((entry) => entry.createValue === value);
  return section?.kind ?? null;
}
