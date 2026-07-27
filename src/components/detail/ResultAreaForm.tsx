"use client";

import { FieldGrid, NumberField, SelectField, TextArea, TextField } from "./fields";
import type { FormTab } from "./FormTabs";
import { CoreHeaderFields, STATE_OPTIONS, type DetailFormProps } from "./formShared";

/**
 * The Result Area form: General / Mission / Vision / Wish / S.W.O.T / Notes.
 *
 * Achieve's six tabs, kept as they are. Most of this will sit empty most of the time — a
 * result area is a life dimension, and you do not write a S.W.O.T for one every week. It is
 * here because occasionally writing one is the point, and because the depth is what made
 * the original worth reimplementing.
 *
 * The Notes tab writes to `nodes.notes`, which every type already has, so there is no
 * result-area-specific notes column.
 */
export function resultAreaTabs(props: DetailFormProps): FormTab[] {
  const { values, patch, patchResultArea, list } = props;
  const area = values.resultArea ?? {};

  return [
    {
      id: "general",
      label: "General",
      render: () => (
        <>
          <CoreHeaderFields values={values} patch={patch} />

          <FieldGrid>
            <TextField
              label="Category"
              value={area.category ?? ""}
              onChange={(category) => patchResultArea({ category })}
              hint="Groups result areas in the outline's category view."
            />
            <SelectField
              label="State"
              value={values.state}
              options={STATE_OPTIONS}
              onChange={(state) => state && patch({ state })}
            />
          </FieldGrid>

          <TextArea
            label="Description"
            rows={4}
            value={area.description ?? ""}
            onChange={(description) => patchResultArea({ description })}
            placeholder="What this area of your life covers."
          />

          <FieldGrid>
            <NumberField
              label="Importance"
              value={area.importance ?? null}
              onChange={(importance) => patchResultArea({ importance })}
              min={0}
              max={100}
              hint="How much this area matters against the others, 0–100."
            />
          </FieldGrid>

          <TextArea
            label="Reason"
            rows={3}
            value={area.reason ?? ""}
            onChange={(reason) => patchResultArea({ reason })}
            placeholder="Why this area is on the list at all."
          />
        </>
      ),
    },

    {
      id: "mission",
      label: "Mission",
      render: () => (
        <>
          <TextArea
            label="Mission"
            rows={8}
            value={area.mission ?? ""}
            onChange={(mission) => patchResultArea({ mission })}
            placeholder="What you are trying to do in this area, in a sentence or two."
          />
          {list("guiding_principle")}
        </>
      ),
    },

    {
      id: "vision",
      label: "Vision",
      render: () => (
        <>
          <TextArea
            label="Ideal outer vision"
            rows={7}
            value={area.idealOuterVision ?? ""}
            onChange={(idealOuterVision) => patchResultArea({ idealOuterVision })}
            placeholder="What this area looks like from the outside when it is going well."
          />
          <TextArea
            label="Ideal inner vision"
            rows={7}
            value={area.idealInnerVision ?? ""}
            onChange={(idealInnerVision) => patchResultArea({ idealInnerVision })}
            placeholder="How it feels from the inside when it is going well."
          />
        </>
      ),
    },

    {
      id: "wish",
      label: "Wish",
      render: () => (
        <>
          {list("wish_want_dont_have")}
          {list("wish_dont_want_have")}
          {list("wish_want_have")}
          {list("wish_want_avoid")}
        </>
      ),
    },

    {
      id: "swot",
      label: "S.W.O.T",
      render: () => (
        <FieldGrid>
          <TextArea
            label="Strengths"
            rows={6}
            value={area.strengths ?? ""}
            onChange={(strengths) => patchResultArea({ strengths })}
          />
          <TextArea
            label="Weaknesses"
            rows={6}
            value={area.weaknesses ?? ""}
            onChange={(weaknesses) => patchResultArea({ weaknesses })}
          />
          <TextArea
            label="Opportunities"
            rows={6}
            value={area.opportunities ?? ""}
            onChange={(opportunities) => patchResultArea({ opportunities })}
          />
          <TextArea
            label="Threats"
            rows={6}
            value={area.threats ?? ""}
            onChange={(threats) => patchResultArea({ threats })}
          />
        </FieldGrid>
      ),
    },

    {
      id: "notes",
      label: "Notes",
      render: () => (
        <TextArea
          label="Notes"
          rows={16}
          value={values.notes}
          onChange={(notes) => patch({ notes })}
        />
      ),
    },
  ];
}
