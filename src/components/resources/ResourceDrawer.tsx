"use client";

import { useEffect, useId, useState, useTransition } from "react";
import type { ContactOption } from "@/lib/contacts/types";
import { weeklyAvailableMinutes, weeklyWorkingMinutes } from "@/lib/resources/capacity";
import type { ResourceDetail, ResourceInput } from "@/lib/resources/types";
import {
  getResourceDetailAction,
  updateResourceAction,
} from "@/app/library/resources/actions";
import { Drawer, DrawerFooter, DrawerHeader } from "@/components/detail/Drawer";
import {
  EffortField,
  FieldGrid,
  NumberField,
  Section,
  TextArea,
  TextField,
} from "@/components/detail/fields";
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
  const titleId = useId();
  const [loaded, setLoaded] = useState<{
    resourceId: string;
    detail: ResourceDetail | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!resourceId) return;
    let current = true;
    void getResourceDetailAction(resourceId).then(
      (result) => {
        if (!current) return;
        if (!result.ok) setLoaded({ resourceId, detail: null, error: result.error });
        else if (!result.data) {
          setLoaded({
            resourceId,
            detail: null,
            error: "That resource no longer exists.",
          });
        } else {
          setLoaded({ resourceId, detail: result.data, error: null });
        }
      },
      () => {
        if (current)
          setLoaded({
            resourceId,
            detail: null,
            error: "Could not load this resource.",
          });
      },
    );
    return () => {
      current = false;
    };
  }, [resourceId]);

  if (!resourceId) return null;
  const current = loaded?.resourceId === resourceId ? loaded : null;

  return (
    <Drawer open onClose={onClose} labelledBy={titleId}>
      <DrawerHeader
        titleId={titleId}
        eyebrow="Resource"
        title={
          current?.detail?.shortName ?? (current?.error ? "Could not open" : "Loading…")
        }
        onClose={onClose}
      />
      {current?.error ? (
        <p role="alert" className="px-5 py-4 text-[0.875rem] text-priority-a">
          {current.error}
        </p>
      ) : current?.detail ? (
        <ResourceForm
          key={current.detail.id}
          detail={current.detail}
          contacts={contacts}
          onClose={onClose}
          onChanged={onChanged}
        />
      ) : null}
    </Drawer>
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
  const [draft, setDraft] = useState(() => draftOf(detail));
  const [dirty, setDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startTransition] = useTransition();
  const capacity = weeklyAvailableMinutes(draft);
  const working = weeklyWorkingMinutes(draft);

  function patch<K extends keyof ResourceInput>(
    key: K,
    value: Required<ResourceInput>[K],
  ) {
    setJustSaved(false);
    setDirty(true);
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function save(thenClose: boolean) {
    setError(null);
    startTransition(async () => {
      if (dirty) {
        const result = await updateResourceAction(detail.id, draft);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setDirty(false);
        onChanged();
      }
      if (thenClose) onClose();
      else setJustSaved(true);
    });
  }

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
              <label className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
                Contact
                <select
                  value={draft.contactId ?? ""}
                  onChange={(event) => patch("contactId", event.target.value || null)}
                  className="min-h-tap w-full rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] font-normal normal-case tracking-normal text-ink outline-none focus:border-select-edge md:min-h-0"
                >
                  <option value="">(none)</option>
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.displayName}
                    </option>
                  ))}
                </select>
              </label>
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

      <DrawerFooter
        onSave={() => save(false)}
        onSaveAndClose={() => save(true)}
        onClose={onClose}
        saving={saving}
        dirty={dirty}
        justSaved={justSaved}
        error={error}
      />
    </>
  );
}
