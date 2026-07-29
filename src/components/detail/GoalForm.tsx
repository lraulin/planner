"use client";

import type { ProgressReview } from "@/db/schema";
import { STATE_OPTIONS } from "@/lib/tree/hierarchy";
import {
  CheckboxField,
  ContextsField,
  DateField,
  FieldGrid,
  SelectField,
  Section,
  TextArea,
  TextField,
} from "./fields";
import { LinkedNotesPanel } from "@/components/notes/LinkedNotesPanel";
import type { FormTab } from "./FormTabs";
import { CoreHeaderFields, type DetailFormProps } from "./formShared";

/**
 * Achieve's Range dropdown, in Achieve's order — shortest horizon to longest.
 *
 * The stored value is the label. The column stays free text (see `schema.ts`), so this list
 * is what the form offers rather than what the database will accept, and a row written
 * before the list was known still round-trips.
 */
const RANGE_OPTIONS = [
  "Week",
  "Month",
  "Quarter",
  "Six Months",
  "1-Year",
  "3-Years",
  "5-Years",
  "10-Years",
  "Lifetime",
].map((range) => ({ value: range, label: range }));

const PROGRESS_REVIEW_OPTIONS: { value: ProgressReview; label: string }[] = [
  { value: "none", label: "None" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

/**
 * The Goal form: Achieve's twelve tabs, in Achieve's order. The largest form in the app, and
 * the one that most rewards the shared list machinery — eight of its tabs are a prose field
 * plus a repeating list.
 *
 * **A Dream is a Goal with the Dream box ticked.** Achieve has no Dream entity: the checkbox
 * sits on this tab beside Range, and the form is otherwise identical. The hierarchy stays
 * four types.
 *
 * Range is a dropdown, as it is in Achieve. The column behind it stays free text, so the
 * list can grow without a migration.
 */
export function goalTabs(props: DetailFormProps): FormTab[] {
  const { values, patch, patchGoal, list } = props;
  const goal = values.goal ?? {};

  // A stored value from before the list was known — keep it selectable rather than letting
  // the select silently drop it on the next save.
  const range = goal.range ?? "";
  const rangeOptions =
    range === "" || RANGE_OPTIONS.some((option) => option.value === range)
      ? RANGE_OPTIONS
      : [...RANGE_OPTIONS, { value: range, label: range }];

  return [
    {
      id: "general",
      label: "General",
      render: () => (
        <>
          <CoreHeaderFields values={values} patch={patch} />

          <FieldGrid columns={3}>
            <SelectField
              label="Range"
              value={range}
              options={rangeOptions}
              onChange={(next) => patchGoal({ range: next ?? "" })}
              allowEmpty
              hint="The horizon this goal is set against."
            />
            <SelectField
              label="State"
              value={values.state}
              options={STATE_OPTIONS}
              onChange={(state) => state && patch({ state })}
            />
            <CheckboxField
              label="Dream"
              checked={goal.isDream ?? false}
              onChange={(isDream) => patchGoal({ isDream })}
              hint="A goal you want but have not committed to a date for."
              className="self-end pb-2"
            />
          </FieldGrid>

          <FieldGrid columns={3}>
            <DateField
              label="Planned start"
              value={goal.plannedStart ?? null}
              onChange={(plannedStart) => patchGoal({ plannedStart })}
            />
            <DateField
              label="Deadline"
              value={values.deadline}
              onChange={(deadline) => patch({ deadline })}
            />
            <CheckboxField
              label="Focus"
              checked={values.focus}
              onChange={(focus) => patch({ focus })}
              hint="Shows in the outline's focus-only view."
              className="self-end pb-2"
            />
          </FieldGrid>

          <Section title="Framing">
            <TextField
              label="Values"
              value={goal.values ?? ""}
              onChange={(value) => patchGoal({ values: value })}
              placeholder="Which of your values this serves."
            />
            <TextField
              label="Question"
              value={goal.question ?? ""}
              onChange={(question) => patchGoal({ question })}
              placeholder="The question this goal answers."
            />
            <TextField
              label="Affirmation"
              value={goal.affirmation ?? ""}
              onChange={(affirmation) => patchGoal({ affirmation })}
              placeholder="Stated as though it were already true."
            />
          </Section>

          <TextArea
            label="Definition"
            rows={5}
            markdown
            value={goal.definition ?? ""}
            onChange={(definition) => patchGoal({ definition })}
            placeholder="What exactly counts as reaching this."
          />

          <TextArea
            label="Purpose"
            rows={5}
            markdown
            value={goal.purpose ?? ""}
            onChange={(purpose) => patchGoal({ purpose })}
            placeholder="Why it matters that you reach it."
          />

          <ContextsField
            value={goal.contexts ?? []}
            onChange={(contexts) => patchGoal({ contexts })}
          />
        </>
      ),
    },

    { id: "benefits", label: "Benefits", render: () => list("benefit") },

    {
      id: "vision",
      label: "Vision",
      render: () => (
        <>
          <TextArea
            label="Vision"
            rows={7}
            markdown
            value={goal.vision ?? ""}
            onChange={(vision) => patchGoal({ vision })}
            placeholder="What life looks like once this is true."
          />
          <TextArea
            label="Kind of person"
            rows={5}
            value={goal.kindOfPerson ?? ""}
            onChange={(kindOfPerson) => patchGoal({ kindOfPerson })}
            placeholder="Who you have to be for this to happen."
          />
          <TextArea
            label="Personal changes"
            rows={5}
            value={goal.personalChanges ?? ""}
            onChange={(personalChanges) => patchGoal({ personalChanges })}
            placeholder="What has to change about how you operate."
          />
        </>
      ),
    },

    {
      id: "obstacles",
      label: "Obstacles",
      render: () => (
        <>
          <TextArea
            label="Baseline"
            rows={4}
            value={goal.baseline ?? ""}
            onChange={(baseline) => patchGoal({ baseline })}
            placeholder="Where you are starting from."
          />
          <TextArea
            label="Limiting factor"
            rows={4}
            value={goal.limitingFactor ?? ""}
            onChange={(limitingFactor) => patchGoal({ limitingFactor })}
            placeholder="The one thing most in the way."
          />
          {list("obstacle")}
        </>
      ),
    },

    {
      id: "strategy",
      label: "Strategy",
      render: () => (
        <>
          <TextArea
            label="Strategy"
            rows={6}
            markdown
            value={goal.strategy ?? ""}
            onChange={(strategy) => patchGoal({ strategy })}
            placeholder="How you intend to get there."
          />
          {list("action")}
        </>
      ),
    },

    { id: "beliefs", label: "Beliefs", render: () => list("belief") },

    {
      id: "resources",
      label: "Resources",
      render: () => (
        <>
          {list("resource")}
          {list("environment")}
        </>
      ),
    },

    { id: "team", label: "Team", render: () => list("role") },

    { id: "rewards", label: "Rewards", render: () => list("reward") },

    {
      id: "progress",
      label: "Progress",
      render: () => (
        <>
          <FieldGrid>
            <SelectField
              label="Progress reviews"
              value={goal.progressReview ?? "none"}
              options={PROGRESS_REVIEW_OPTIONS}
              onChange={(progressReview) =>
                progressReview && patchGoal({ progressReview })
              }
              hint="How often you score this goal."
            />
            <CheckboxField
              label="Scorecard"
              checked={goal.scorecard ?? false}
              onChange={(scorecard) => patchGoal({ scorecard })}
              className="self-end pb-2"
            />
          </FieldGrid>
          {list("progress_entry")}
          {list("goal_win")}
        </>
      ),
    },

    { id: "metrics", label: "Metrics", render: () => list("metric") },

    {
      id: "notes",
      label: "Notes",
      render: () => (
        <div className="flex flex-col gap-6">
          <TextArea
            label="Notes"
            rows={12}
            markdown
            value={values.notes}
            onChange={(notes) => patch({ notes })}
          />
          <LinkedNotesPanel nodeId={props.detail.id} notes={props.detail.linkedNotes} />
        </div>
      ),
    },
  ];
}
