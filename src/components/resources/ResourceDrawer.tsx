"use client";

import type { ContactOption } from "@/lib/contacts/types";
import { weeklyAvailableMinutes, weeklyWorkingMinutes } from "@/lib/resources/capacity";
import type { ResourceDetail, ResourceInput } from "@/lib/resources/types";
import {
  getResourceDetailAction,
  updateResourceAction,
} from "@/app/(shell)/library/resources/actions";
import { DrawerFooter, DrawerLeaveGuard } from "@/components/detail/Drawer";
import { RecordDrawer } from "@/components/detail/RecordDrawer";
import { useDrawerForm } from "@/components/detail/useDrawerForm";
import {
  EffortField,
  FieldGrid,
  NumberField,
  Section,
  TextArea,
  TextField,
} from "@/components/detail/fields";
import { ContactSelect } from "@/components/contacts/ContactSelect";
import { formatEffort } from "@/lib/tree/format";

function draftOf(detail: ResourceDetail): Required<ResourceInput> {
  return {
    shortName: detail.shortName,
    description: detail.description,
    contactId: detail.contactId,
    overheadPercent: detail.overheadPercent,
    effectivenessPercent: detail.effectivenessPercent,
    mondayMinutes: detail.mondayMinutes,
    tuesdayMinutes: detail.tuesdayMinutes,
    wednesdayMinutes: detail.wednesdayMinutes,
    thursdayMinutes: detail.thursdayMinutes,
    fridayMinutes: detail.fridayMinutes,
    saturdayMinutes: detail.saturdayMinutes,
    sundayMinutes: detail.sundayMinutes,
  };
}

/** The resource's name wherever it is shown: its grid row, its drawer, the delete confirm. */
export function resourceName(resource: Pick<ResourceDetail, "shortName">): string {
  return resource.shortName || "Untitled resource";
}

/** Explicit-save Resource Information form, following the shared structured drawer pattern. */
export function ResourceDrawer({
  resourceId,
  contacts,
  onClose,
  onChanged,
}: {
  resourceId: string | null;
  contacts: ContactOption[];
  onClose: () => void;
  onChanged: () => void;
}) {
  return (
    <RecordDrawer
      recordId={resourceId}
      load={getResourceDetailAction}
      noun="resource"
      titleOf={resourceName}
      onClose={onClose}
    >
      {(detail) => (
        <ResourceForm
          detail={detail}
          contacts={contacts}
          onClose={onClose}
          onChanged={onChanged}
        />
      )}
    </RecordDrawer>
  );
}

function ResourceForm({
  detail,
  contacts,
  onClose,
  onChanged,
}: {
  detail: ResourceDetail;
  contacts: ContactOption[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { draft, patch, dirty, footer } = useDrawerForm({
    initial: () => draftOf(detail),
    persist: (next) => updateResourceAction(detail.id, next),
    onChanged,
    onClose,
  });
  const capacity = weeklyAvailableMinutes(draft);
  const working = weeklyWorkingMinutes(draft);

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="flex flex-col gap-6">
          <Section title="Resource">
            <FieldGrid>
              <TextField
                label="Short name"
                value={draft.shortName}
                onChange={(value) => patch("shortName", value)}
                hint="The concise name scheduling will use."
              />
              <ContactSelect
                label="Contact"
                value={draft.contactId}
                onChange={(contactId) => patch("contactId", contactId)}
                contacts={contacts}
              />
            </FieldGrid>
            <TextArea
              label="Description"
              rows={4}
              value={draft.description}
              onChange={(value) => patch("description", value)}
            />
          </Section>

          <Section title="Capacity">
            <FieldGrid>
              <NumberField
                label="Overhead"
                value={draft.overheadPercent}
                min={0}
                max={100}
                suffix="%"
                hint="Time that cannot go to projects."
                onChange={(value) => patch("overheadPercent", value ?? 0)}
              />
              <NumberField
                label="Effectiveness"
                value={draft.effectivenessPercent}
                min={0}
                max={10000}
                suffix="%"
                hint="100% is an average team member."
                onChange={(value) => patch("effectivenessPercent", value ?? 0)}
              />
            </FieldGrid>
            <p className="rounded border border-rule bg-surface-raised/50 px-3 py-2 text-[0.8125rem] text-ink-muted">
              {formatEffort(working) || "0"} working time →{" "}
              <strong className="font-medium text-ink">
                {formatEffort(capacity) || "0"}
              </strong>{" "}
              available for the week.
            </p>
          </Section>

          <Section title="Working time">
            <FieldGrid>
              <EffortField
                label="Monday"
                value={draft.mondayMinutes}
                onChange={(value) => patch("mondayMinutes", value ?? 0)}
              />
              <EffortField
                label="Tuesday"
                value={draft.tuesdayMinutes}
                onChange={(value) => patch("tuesdayMinutes", value ?? 0)}
              />
              <EffortField
                label="Wednesday"
                value={draft.wednesdayMinutes}
                onChange={(value) => patch("wednesdayMinutes", value ?? 0)}
              />
              <EffortField
                label="Thursday"
                value={draft.thursdayMinutes}
                onChange={(value) => patch("thursdayMinutes", value ?? 0)}
              />
              <EffortField
                label="Friday"
                value={draft.fridayMinutes}
                onChange={(value) => patch("fridayMinutes", value ?? 0)}
              />
              <EffortField
                label="Saturday"
                value={draft.saturdayMinutes}
                onChange={(value) => patch("saturdayMinutes", value ?? 0)}
              />
              <EffortField
                label="Sunday"
                value={draft.sundayMinutes}
                onChange={(value) => patch("sundayMinutes", value ?? 0)}
              />
            </FieldGrid>
          </Section>
        </div>
      </div>

      <DrawerLeaveGuard dirty={dirty} />

      <DrawerFooter {...footer} />
    </>
  );
}
