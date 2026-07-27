"use client";

import { formatEffort } from "@/lib/tree/format";
import {
  ContextsField,
  EffortField,
  FieldGrid,
  NumberField,
  ReadOnlyField,
  Section,
  SelectField,
  TextArea,
} from "./fields";
import type { FormTab } from "./FormTabs";
import {
  CoreHeaderFields,
  CoreScheduleFields,
  STATE_OPTIONS,
  type DetailFormProps,
} from "./formShared";

/**
 * Goals and Tasks: one pane, no tabs — `ux-principles.md` only calls for tabs when a form
 * has distinct groups of fields, and these do not.
 *
 * Achieve has richer forms for both. Building them needs reference captures we do not have
 * yet, so this covers the schema that exists today rather than leaving `Enter` doing nothing
 * on two of the four types.
 *
 * For a Task this is also where Effort Left, Actual Effort, and % complete finally become
 * editable — until now they were stored, rolled up, and reachable only from the seed.
 */
export function simpleNodeTabs(props: DetailFormProps): FormTab[] {
  const { detail, node, values, patch, patchTask } = props;
  const task = values.task ?? {};
  const isTask = detail.type === "task";

  // A parent task reports the total of its children, so its own numbers have nowhere to
  // show — the same rule the outline grid's effort cell follows.
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
            <CoreScheduleFields values={values} patch={patch} />
          </FieldGrid>

          {isTask && (
            <Section title="Effort">
              {rollsUp ? (
                <FieldGrid columns={3}>
                  <ReadOnlyField
                    label="Effort"
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
                  <ReadOnlyField
                    label="% complete"
                    value={`${node.percentCompleteRollup} %`}
                    hint="Weighted by effort."
                  />
                </FieldGrid>
              ) : (
                <FieldGrid columns={3}>
                  <EffortField
                    label="Effort"
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
                </FieldGrid>
              )}

              <ContextsField
                value={task.contexts ?? []}
                onChange={(contexts) => patchTask({ contexts })}
              />
            </Section>
          )}

          <TextArea
            label="Notes"
            rows={10}
            value={values.notes}
            onChange={(notes) => patch({ notes })}
          />
        </>
      ),
    },
  ];
}
