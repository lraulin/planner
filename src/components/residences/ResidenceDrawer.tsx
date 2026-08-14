"use client";

import { useEffect, useId, useState, useTransition } from "react";
import {
  getResidenceDetailAction,
  updateResidenceAction,
} from "@/app/library/residences/actions";
import { Drawer, DrawerHeader, DrawerFooter } from "@/components/detail/Drawer";
import { FormTabs } from "@/components/detail/FormTabs";
import {
  ComboboxField,
  DateKeyField,
  FieldGrid,
  MoneyField,
  Section,
  TextArea,
  TextField,
} from "@/components/detail/fields";
import { HOUSING_TYPES } from "@/lib/residences/vocabulary";
import type { ResidenceDetail, ResidenceInput } from "@/lib/residences/types";

type TabId = "address" | "tenancy" | "notes";

function draftOf(detail: ResidenceDetail): Required<ResidenceInput> {
  return {
    label: detail.label,
    streetAddress: detail.streetAddress,
    extendedAddress: detail.extendedAddress,
    city: detail.city,
    region: detail.region,
    postalCode: detail.postalCode,
    country: detail.country,
    countryCode: detail.countryCode,
    movedIn: detail.movedIn,
    movedOut: detail.movedOut,
    housingType: detail.housingType,
    monthlyRent: detail.monthlyRent,
    reasonForLeaving: detail.reasonForLeaving,
    landlordName: detail.landlordName,
    landlordPhone: detail.landlordPhone,
    landlordEmail: detail.landlordEmail,
    notes: detail.notes,
  };
}

function titleOf(detail: ResidenceDetail): string {
  return detail.city || detail.label || detail.streetAddress || "Untitled residence";
}

/** Explicit-save Residence form, following the shared structured drawer pattern. */
export function ResidenceDrawer({
  residenceId,
  onClose,
  onChanged,
}: {
  residenceId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const titleId = useId();
  const [loaded, setLoaded] = useState<{
    residenceId: string;
    detail: ResidenceDetail | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!residenceId) return;
    let current = true;
    void getResidenceDetailAction(residenceId).then(
      (result) => {
        if (!current) return;
        if (!result.ok) setLoaded({ residenceId, detail: null, error: result.error });
        else if (!result.data) {
          setLoaded({
            residenceId,
            detail: null,
            error: "That residence no longer exists.",
          });
        } else {
          setLoaded({ residenceId, detail: result.data, error: null });
        }
      },
      () => {
        if (current) {
          setLoaded({
            residenceId,
            detail: null,
            error: "Could not load this residence.",
          });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [residenceId]);

  if (!residenceId) return null;
  const current = loaded?.residenceId === residenceId ? loaded : null;

  return (
    <Drawer open onClose={onClose} labelledBy={titleId}>
      <DrawerHeader
        titleId={titleId}
        eyebrow="Residence"
        title={
          current?.detail
            ? titleOf(current.detail)
            : current?.error
              ? "Could not open"
              : "Loading…"
        }
        onClose={onClose}
      />
      {current?.error ? (
        <p role="alert" className="px-5 py-4 text-[0.875rem] text-priority-a">
          {current.error}
        </p>
      ) : current?.detail ? (
        <ResidenceForm
          key={current.detail.id}
          detail={current.detail}
          onClose={onClose}
          onChanged={onChanged}
        />
      ) : null}
    </Drawer>
  );
}

function ResidenceForm({
  detail,
  onClose,
  onChanged,
}: {
  detail: ResidenceDetail;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState(() => draftOf(detail));
  const [tab, setTab] = useState<TabId>("address");
  const [dirty, setDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startTransition] = useTransition();

  function patch<K extends keyof ResidenceInput>(
    key: K,
    value: Required<ResidenceInput>[K],
  ) {
    setJustSaved(false);
    setDirty(true);
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function save(thenClose: boolean) {
    setError(null);
    startTransition(async () => {
      if (dirty) {
        const result = await updateResidenceAction(detail.id, draft);
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

  const tabs = [
    {
      id: "address" as const,
      label: "Address",
      render: () => (
        <Section title="Where">
          <TextField
            label="Name"
            value={draft.label}
            placeholder="The Seoul apartment"
            hint="Optional. What you call the place, if the address is not how you think of it."
            onChange={(value) => patch("label", value)}
          />
          <TextField
            label="Street"
            value={draft.streetAddress}
            onChange={(value) => patch("streetAddress", value)}
          />
          <TextField
            label="Apartment, suite, floor"
            value={draft.extendedAddress}
            onChange={(value) => patch("extendedAddress", value)}
          />
          <FieldGrid>
            <TextField
              label="City"
              value={draft.city}
              onChange={(value) => patch("city", value)}
            />
            {/* Not "State" — Korea has provinces and no state at all. */}
            <TextField
              label="State / Province / Region"
              value={draft.region}
              onChange={(value) => patch("region", value)}
            />
            <TextField
              label="Postal code"
              value={draft.postalCode}
              onChange={(value) => patch("postalCode", value)}
            />
            <TextField
              label="Country"
              value={draft.country}
              onChange={(value) => patch("country", value)}
            />
          </FieldGrid>
        </Section>
      ),
    },
    {
      id: "tenancy" as const,
      label: "Tenancy",
      render: () => (
        <>
          <Section title="Dates">
            <FieldGrid>
              <DateKeyField
                label="Moved in"
                value={draft.movedIn}
                onChange={(value) => patch("movedIn", value)}
              />
              <DateKeyField
                label="Moved out"
                value={draft.movedOut}
                onChange={(value) => patch("movedOut", value)}
                hint="Leave blank if you still live here."
              />
            </FieldGrid>
          </Section>

          <Section title="Terms">
            <FieldGrid>
              <ComboboxField
                label="Housing type"
                value={draft.housingType}
                options={HOUSING_TYPES}
                onChange={(value) => patch("housingType", value)}
              />
              <MoneyField
                label="Monthly rent"
                value={draft.monthlyRent}
                onChange={(value) => patch("monthlyRent", value)}
              />
            </FieldGrid>
            <TextField
              label="Reason for leaving"
              value={draft.reasonForLeaving}
              onChange={(value) => patch("reasonForLeaving", value)}
            />
          </Section>

          <Section title="Landlord or property manager">
            <FieldGrid columns={3}>
              <TextField
                label="Name"
                value={draft.landlordName}
                onChange={(value) => patch("landlordName", value)}
              />
              <TextField
                label="Phone"
                value={draft.landlordPhone}
                onChange={(value) => patch("landlordPhone", value)}
              />
              <TextField
                label="Email"
                value={draft.landlordEmail}
                onChange={(value) => patch("landlordEmail", value)}
              />
            </FieldGrid>
          </Section>
        </>
      ),
    },
    {
      id: "notes" as const,
      label: "Notes",
      render: () => (
        <Section title="Notes">
          <TextArea
            label="Anything else worth keeping"
            rows={12}
            value={draft.notes}
            onChange={(value) => patch("notes", value)}
          />
        </Section>
      ),
    },
  ];

  return (
    <>
      <FormTabs tabs={tabs} active={tab} onSelect={(id) => setTab(id as TabId)} />
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
