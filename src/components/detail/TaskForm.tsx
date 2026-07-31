"use client";

import type { RecurrenceFrequency, TaskConstraint } from "@/db/schema";
import { formatEffort } from "@/lib/tree/format";
import { STATE_OPTIONS } from "@/lib/tree/hierarchy";
import {
  CheckboxField,
  ContextsField,
  DateField,
  EffortField,
  FieldGrid,
  MoneyField,
  NumberField,
  ReadOnlyField,
  Section,
  SelectField,
  TextArea,
  TextField,
} from "./fields";
import { LinkedNotesPanel } from "@/components/notes/LinkedNotesPanel";
import { TaskFitnessPanel } from "@/components/fitness/TaskFitnessPanel";
import type { FormTab } from "./FormTabs";
import { CoreHeaderFields, type DetailFormProps } from "./formShared";

/**
 * Achieve's regeneration-based recurrence (manual §3.9.1), read as "every N {unit} after
 * each completion". `none` is the default: the task does not repeat.
 */
const REPEATS_OPTIONS: { value: RecurrenceFrequency; label: string }[] = [
  { value: "none", label: "Never" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

/** Unit shown after the interval, so "Every 2" reads as "Every 2 weeks". */
const INTERVAL_SUFFIX: Record<RecurrenceFrequency, string> = {
  none: "",
  daily: "days",
  weekly: "weeks",
  monthly: "months",
  yearly: "years",
};

const CONSTRAINT_OPTIONS: { value: TaskConstraint; label: string }[] = [
  { value: "as_soon_as_possible", label: "As soon as possible" },
  { value: "as_late_as_possible", label: "As late as possible" },
  { value: "start_no_earlier_than", label: "Start no earlier than" },
  { value: "start_no_later_than", label: "Start no later than" },
  { value: "finish_no_earlier_than", label: "Finish no earlier than" },
  { value: "finish_no_later_than", label: "Finish no later than" },
  { value: "must_start_on", label: "Must start on" },
  { value: "must_finish_on", label: "Must finish on" },
];

/**
 * The Task form: Achieve's five tabs — General, Schedule, Contacts, Attachments, Details.
 *
 * Contacts and Attachments reuse the same list kinds as the Project form, which is the
 * payoff of one `node_items` table: a list that appears on two forms is one config and one
 * renderer, not two of each.
 *
 * A parent task shows rollups instead of its own numbers, exactly as the outline's effort
 * cell does — its children's totals are what anyone reading the row actually wants.
 */
export function taskTabs(props: DetailFormProps): FormTab[] {
  const { node, values, patch, patchTask, list } = props;
  const task = values.task ?? {};
  const rollsUp = node.hasChildren;

  return [
    {
      id: "general",
      label: "General",
      render: () => (
        <>
          <CoreHeaderFields values={values} patch={patch} />

          <FieldGrid>
            <SelectField
              label="State"
              value={values.state}
              options={STATE_OPTIONS}
              onChange={(state) => state && patch({ state })}
            />
            <CheckboxField
              label="Focus"
              checked={values.focus}
              onChange={(focus) => patch({ focus })}
              hint="Shows in the outline's focus-only view."
              className="self-end pb-2"
            />
          </FieldGrid>

          <TaskFitnessPanel
            exerciseId={task.exerciseId ?? null}
            onChange={(exerciseId) => patchTask({ exerciseId })}
          />

          <Section title="Dates">
            <FieldGrid columns={3}>
              <DateField
                label="Target start"
                value={task.targetStartDate ?? null}
                onChange={(targetStartDate) => patchTask({ targetStartDate })}
              />
              <DateField
                label="Target end"
                value={task.targetEndDate ?? null}
                onChange={(targetEndDate) => patchTask({ targetEndDate })}
              />
              <DateField
                label="Deadline"
                value={values.deadline}
                onChange={(deadline) => patch({ deadline })}
              />
              <DateField
                label="Deferred until"
                value={task.deferredDate ?? null}
                onChange={(deferredDate) => patchTask({ deferredDate })}
              />
              <EffortField
                label="Lead time"
                value={task.leadTimeMinutes ?? null}
                onChange={(leadTimeMinutes) => patchTask({ leadTimeMinutes })}
              />
              <EffortField
                label="Deadline lead time"
                value={task.deadlineLeadTimeMinutes ?? null}
                onChange={(deadlineLeadTimeMinutes) =>
                  patchTask({ deadlineLeadTimeMinutes })
                }
              />
            </FieldGrid>
          </Section>

          <Section title="Recurrence">
            <FieldGrid columns={3}>
              <SelectField
                label="Repeats"
                value={task.recurrenceFrequency ?? "none"}
                options={REPEATS_OPTIONS}
                onChange={(recurrenceFrequency) =>
                  patchTask({ recurrenceFrequency: recurrenceFrequency ?? "none" })
                }
                hint="Completing a repeating task starts it over instead of finishing it."
              />
              {(task.recurrenceFrequency ?? "none") !== "none" && (
                <NumberField
                  label="Every"
                  value={task.recurrenceInterval ?? 1}
                  onChange={(recurrenceInterval) =>
                    patchTask({ recurrenceInterval: recurrenceInterval ?? 1 })
                  }
                  min={1}
                  max={999}
                  suffix={INTERVAL_SUFFIX[task.recurrenceFrequency ?? "none"]}
                  hint="Counted from each completion, not from the last due date."
                />
              )}
            </FieldGrid>
          </Section>

          <Section title="Progress">
            <FieldGrid columns={3}>
              {rollsUp ? (
                <ReadOnlyField
                  label="% complete"
                  value={`${node.percentCompleteRollup} %`}
                  hint="Weighted by effort across the subtree."
                />
              ) : (
                <NumberField
                  label="% complete"
                  value={task.percentComplete ?? 0}
                  onChange={(percentComplete) =>
                    patchTask({ percentComplete: percentComplete ?? 0 })
                  }
                  min={0}
                  max={100}
                  suffix="%"
                />
              )}
              <ReadOnlyField label="Sub-tasks" value={String(node.childCount)} />
            </FieldGrid>
          </Section>

          <Section title="Context">
            <FieldGrid>
              <TextField
                label="Source"
                value={task.source ?? ""}
                onChange={(source) => patchTask({ source })}
                hint="Where this came from — a meeting, an email, a person."
              />
              <TextField
                label="Place"
                value={task.place ?? ""}
                onChange={(place) => patchTask({ place })}
              />
              <ContextsField
                value={task.contexts ?? []}
                onChange={(contexts) => patchTask({ contexts })}
                className="sm:col-span-2"
              />
            </FieldGrid>

            <CheckboxField
              label="Private"
              checked={task.private ?? false}
              onChange={(value) => patchTask({ private: value })}
            />
          </Section>
        </>
      ),
    },

    {
      id: "schedule",
      label: "Schedule",
      render: () => (
        <>
          <Section title="Effort">
            {rollsUp ? (
              <FieldGrid columns={3}>
                <ReadOnlyField
                  label="Expected effort"
                  value={formatEffort(node.effortRollupMinutes)}
                  hint="Total of everything below."
                />
                <ReadOnlyField
                  label="Effort left"
                  value={formatEffort(node.effortLeftRollupMinutes)}
                />
                <ReadOnlyField
                  label="Actual effort"
                  value={formatEffort(node.actualEffortRollupMinutes)}
                />
              </FieldGrid>
            ) : (
              <FieldGrid columns={3}>
                <EffortField
                  label="Expected effort"
                  value={task.effortMinutes ?? null}
                  onChange={(effortMinutes) => patchTask({ effortMinutes })}
                />
                <EffortField
                  label="Effort left"
                  value={task.effortLeftMinutes ?? null}
                  onChange={(effortLeftMinutes) => patchTask({ effortLeftMinutes })}
                />
                <EffortField
                  label="Actual effort"
                  value={task.actualEffortMinutes ?? null}
                  onChange={(actualEffortMinutes) =>
                    patchTask({ actualEffortMinutes: actualEffortMinutes ?? 0 })
                  }
                />
              </FieldGrid>
            )}

            <FieldGrid>
              <CheckboxField
                label="Effort driven"
                checked={task.effortDriven ?? true}
                onChange={(effortDriven) => patchTask({ effortDriven })}
                hint="Schedule stretches to fit the work, not the calendar."
              />
              <CheckboxField
                label="Milestone"
                checked={task.milestone ?? false}
                onChange={(milestone) => patchTask({ milestone })}
                hint="A marker to hit, not a piece of work to do."
              />
            </FieldGrid>

            <FieldGrid columns={3}>
              <EffortField
                label="Duration"
                value={task.durationMinutes ?? null}
                onChange={(durationMinutes) => patchTask({ durationMinutes })}
              />
              <DateField
                label="Actual start"
                value={task.actualStartDate ?? null}
                onChange={(actualStartDate) => patchTask({ actualStartDate })}
              />
              <DateField
                label="Date completed"
                value={task.dateCompleted ?? null}
                onChange={(dateCompleted) => patchTask({ dateCompleted })}
              />
            </FieldGrid>
          </Section>

          <Section title="Constraint">
            <FieldGrid>
              <SelectField
                label="Task constraint"
                value={task.constraint ?? "as_soon_as_possible"}
                options={CONSTRAINT_OPTIONS}
                onChange={(constraint) => constraint && patchTask({ constraint })}
              />
              <DateField
                label="Constraint date"
                value={task.constraintDate ?? null}
                onChange={(constraintDate) => patchTask({ constraintDate })}
              />
              <TextField
                label="WBS"
                value={task.wbs ?? ""}
                onChange={(wbs) => patchTask({ wbs })}
                hint="Work-breakdown code, like 1.2.3."
              />
            </FieldGrid>
          </Section>

          <Section title="Cost">
            <FieldGrid columns={3}>
              <MoneyField
                label="Cost low"
                value={task.costLow ?? null}
                onChange={(costLow) => patchTask({ costLow })}
              />
              <MoneyField
                label="Cost high"
                value={task.costHigh ?? null}
                onChange={(costHigh) => patchTask({ costHigh })}
              />
              <MoneyField
                label="Actual cost"
                value={task.actualCost ?? null}
                onChange={(actualCost) => patchTask({ actualCost })}
              />
            </FieldGrid>
          </Section>
        </>
      ),
    },

    { id: "contacts", label: "Contacts", render: () => list("contact") },

    { id: "attachments", label: "Attachments", render: () => list("attachment") },

    {
      id: "details",
      label: "Details",
      render: () => (
        <>
          <FieldGrid>
            <TextField
              label="Company"
              value={task.company ?? ""}
              onChange={(company) => patchTask({ company })}
            />
            <TextField
              label="Mileage"
              value={task.mileage ?? ""}
              onChange={(mileage) => patchTask({ mileage })}
            />
          </FieldGrid>

          <TextArea
            label="Billing information"
            rows={3}
            value={task.billingInformation ?? ""}
            onChange={(billingInformation) => patchTask({ billingInformation })}
          />

          <TextArea
            label="Description"
            rows={6}
            markdown
            value={task.description ?? ""}
            onChange={(description) => patchTask({ description })}
          />
        </>
      ),
    },

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
