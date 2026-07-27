"use client";

import type { Sensitivity } from "@/db/schema";
import { formatEffort } from "@/lib/tree/format";
import {
  CheckboxField,
  ContextsField,
  DateField,
  EffortField,
  FieldGrid,
  MoneyField,
  ReadOnlyField,
  SelectField,
  Section,
  TextArea,
  TextField,
} from "./fields";
import { STATE_OPTIONS } from "@/lib/tree/hierarchy";
import type { FormTab } from "./FormTabs";
import { CoreHeaderFields, type DetailFormProps } from "./formShared";

const SENSITIVITY_OPTIONS: { value: Sensitivity; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "personal", label: "Personal" },
  { value: "private", label: "Private" },
  { value: "confidential", label: "Confidential" },
];

/**
 * The Project form: Achieve's eleven tabs, in Achieve's order.
 *
 * Effort, % complete, and the child count are read-only. All four are rollups of the
 * subtree, computed in `src/lib/tree/derive.ts` and read here off the row the drawer was
 * opened from — offering an editor for a value that would immediately be overwritten by the
 * computation is exactly what `ux-principles.md` forbids.
 *
 * The scheduling fields (Project Start, Target End, Lead Time, Block Size, Time per week,
 * Effort Driven) are stored but inert: the weekly calendar that reads them is the next
 * roadmap item after this one.
 */
export function projectTabs(props: DetailFormProps): FormTab[] {
  const { node, values, patch, patchProject, list } = props;
  const project = values.project ?? {};

  return [
    {
      id: "general",
      label: "General",
      render: () => (
        <>
          <CoreHeaderFields values={values} patch={patch} />

          <Section title="Schedule">
            <FieldGrid columns={3}>
              <DateField
                label="Project start"
                value={project.projectStart ?? null}
                onChange={(projectStart) => patchProject({ projectStart })}
              />
              <DateField
                label="Target end"
                value={project.targetEnd ?? null}
                onChange={(targetEnd) => patchProject({ targetEnd })}
              />
              <DateField
                label="Deadline"
                value={values.deadline}
                onChange={(deadline) => patch({ deadline })}
              />
            </FieldGrid>
          </Section>

          <Section title="Effort">
            {/* Every figure here is the total of everything below this project. */}
            <FieldGrid columns={3}>
              <ReadOnlyField
                label="Expected effort"
                value={formatEffort(node.effortRollupMinutes)}
                hint="Total of the tasks below."
              />
              <ReadOnlyField
                label="Effort to date"
                value={formatEffort(node.actualEffortRollupMinutes)}
              />
              <ReadOnlyField
                label="Effort left"
                value={formatEffort(node.effortLeftRollupMinutes)}
              />
              <ReadOnlyField
                label="% complete"
                value={`${node.percentCompleteRollup} %`}
                hint="Weighted by effort."
              />
              <ReadOnlyField label="Items below" value={String(node.childCount)} />
            </FieldGrid>

            <FieldGrid>
              <CheckboxField
                label="Effort driven"
                checked={project.effortDriven ?? true}
                onChange={(effortDriven) => patchProject({ effortDriven })}
                hint="Schedule stretches to fit the work, not the calendar."
              />
              <CheckboxField
                label="Only show next task in chooser"
                checked={project.onlyShowNextTask ?? false}
                onChange={(onlyShowNextTask) => patchProject({ onlyShowNextTask })}
              />
            </FieldGrid>
          </Section>

          <Section title="Planning">
            <FieldGrid columns={3}>
              <EffortField
                label="Lead time"
                value={project.leadTimeMinutes ?? null}
                onChange={(leadTimeMinutes) => patchProject({ leadTimeMinutes })}
              />
              <EffortField
                label="Block size"
                value={project.blockSizeMinutes ?? null}
                onChange={(blockSizeMinutes) => patchProject({ blockSizeMinutes })}
              />
              <EffortField
                label="Time per week"
                value={project.timePerWeekMinutes ?? null}
                onChange={(timePerWeekMinutes) => patchProject({ timePerWeekMinutes })}
              />
            </FieldGrid>

            <FieldGrid>
              <SelectField
                label="State"
                value={values.state}
                options={STATE_OPTIONS}
                onChange={(state) => state && patch({ state })}
              />
              <SelectField
                label="Sensitivity"
                value={project.sensitivity ?? "normal"}
                options={SENSITIVITY_OPTIONS}
                onChange={(sensitivity) => sensitivity && patchProject({ sensitivity })}
              />
              {/* Deadline lives in the Schedule section above, beside its two siblings. */}
              <CheckboxField
                label="Focus"
                checked={values.focus}
                onChange={(focus) => patch({ focus })}
                hint="Shows in the outline's focus-only view."
                className="self-end pb-2"
              />
            </FieldGrid>

            <FieldGrid>
              <TextField
                label="Assigned to"
                value={project.assignedTo ?? ""}
                onChange={(assignedTo) => patchProject({ assignedTo })}
              />
              <TextField
                label="Place"
                value={project.place ?? ""}
                onChange={(place) => patchProject({ place })}
              />
              <ContextsField
                value={project.contexts ?? []}
                onChange={(contexts) => patchProject({ contexts })}
                className="sm:col-span-2"
              />
            </FieldGrid>

            <CheckboxField
              label="Recompute task deadlines if the project deadline changes"
              checked={project.recomputeTaskDeadlines ?? false}
              onChange={(recomputeTaskDeadlines) =>
                patchProject({ recomputeTaskDeadlines })
              }
            />
          </Section>

          <TextArea
            label="Project notes"
            rows={6}
            value={values.notes}
            onChange={(notes) => patch({ notes })}
          />
        </>
      ),
    },

    {
      id: "objectives",
      label: "Objectives",
      render: () => (
        <>
          <TextArea
            label="Purpose"
            rows={5}
            value={project.purpose ?? ""}
            onChange={(purpose) => patchProject({ purpose })}
            placeholder="Why this project exists."
          />
          {list("objective")}
        </>
      ),
    },

    {
      id: "vision",
      label: "Vision",
      render: () => (
        <>
          <TextArea
            label="Ideal vision"
            rows={7}
            value={project.idealVision ?? ""}
            onChange={(idealVision) => patchProject({ idealVision })}
            placeholder="What the best possible outcome looks like."
          />
          <TextArea
            label="Sufficient vision"
            rows={7}
            value={project.sufficientVision ?? ""}
            onChange={(sufficientVision) => patchProject({ sufficientVision })}
            placeholder="What would be good enough to call this done."
          />
        </>
      ),
    },

    { id: "stakeholders", label: "Stakeholders", render: () => list("stakeholder") },

    { id: "risks", label: "Risks", render: () => list("risk") },

    {
      id: "strategy",
      label: "Strategy",
      render: () => (
        <>
          {list("constraint")}
          <TextArea
            label="Strategy"
            rows={6}
            value={project.strategy ?? ""}
            onChange={(strategy) => patchProject({ strategy })}
            placeholder="The approach you settled on."
          />
          {list("strategy")}
        </>
      ),
    },

    { id: "team", label: "Team", render: () => list("role") },

    { id: "contacts", label: "Contacts", render: () => list("contact") },

    { id: "issues", label: "Issues", render: () => list("issue") },

    { id: "attachments", label: "Attachments", render: () => list("attachment") },

    {
      id: "details",
      label: "Details",
      render: () => (
        <>
          <Section title="Cost">
            <FieldGrid>
              <MoneyField
                label="Expected cost"
                value={project.expectedCost ?? null}
                onChange={(expectedCost) => patchProject({ expectedCost })}
              />
              <MoneyField
                label="Cost to date"
                value={project.costToDate ?? null}
                onChange={(costToDate) => patchProject({ costToDate })}
              />
              <MoneyField
                label="Low cost"
                value={project.lowCost ?? null}
                onChange={(lowCost) => patchProject({ lowCost })}
              />
              <MoneyField
                label="High cost"
                value={project.highCost ?? null}
                onChange={(highCost) => patchProject({ highCost })}
              />
            </FieldGrid>
          </Section>

          <Section title="Billing">
            <FieldGrid>
              <TextField
                label="Company"
                value={project.company ?? ""}
                onChange={(company) => patchProject({ company })}
              />
              <TextField
                label="Mileage"
                value={project.mileage ?? ""}
                onChange={(mileage) => patchProject({ mileage })}
              />
            </FieldGrid>
            <TextArea
              label="Billing information"
              rows={3}
              value={project.billingInformation ?? ""}
              onChange={(billingInformation) => patchProject({ billingInformation })}
            />
          </Section>

          <TextArea
            label="Description"
            rows={5}
            value={project.description ?? ""}
            onChange={(description) => patchProject({ description })}
          />
        </>
      ),
    },
  ];
}
