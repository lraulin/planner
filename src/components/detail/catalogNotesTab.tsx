"use client";

import type { ReactNode } from "react";
import { Section, TextArea } from "./fields";

/**
 * The Notes tab shared by the House, Job and Residence drawers — free-form text with the
 * same prompt, so those catalogs do not each invent a slightly different one.
 */
export function catalogNotesTab(
  notes: string,
  onChange: (value: string) => void,
): {
  id: "notes";
  label: string;
  render: () => ReactNode;
} {
  return {
    id: "notes",
    label: "Notes",
    render: () => (
      <Section title="Notes">
        <TextArea
          label="Anything else worth keeping"
          rows={12}
          value={notes}
          onChange={onChange}
        />
      </Section>
    ),
  };
}
