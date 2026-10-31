"use client";

import { useState } from "react";
import {
  getResidenceDetailAction,
  updateResidenceAction,
} from "@/app/(shell)/library/residences/actions";
import { DrawerFooter, DrawerLeaveGuard } from "@/components/detail/Drawer";
import { RecordDrawer } from "@/components/detail/RecordDrawer";
import { useDrawerForm } from "@/components/detail/useDrawerForm";
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

/** The residence's name wherever it is shown: its grid row, its drawer, the delete confirm. */
export function residenceName(
  residence: Pick<ResidenceDetail, "city" | "label" | "streetAddress">,
): string {
  return (
    residence.city || residence.label || residence.streetAddress || "Untitled residence"
  );
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
  return (
    <RecordDrawer
      recordId={residenceId}
      load={getResidenceDetailAction}
      noun="residence"
      titleOf={residenceName}
      onClose={onClose}
    >
      {(detail) => (
        <ResidenceForm detail={detail} onClose={onClose} onChanged={onChanged} />
      )}
    </RecordDrawer>
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
  const { draft, patch, dirty, footer } = useDrawerForm({
    initial: () => draftOf(detail),
    persist: (next) => updateResidenceAction(detail.id, next),
    onChanged,
    onClose,
  });
  const [tab, setTab] = useState<TabId>("address");

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
      <DrawerLeaveGuard dirty={dirty} />
      <DrawerFooter {...footer} />
    </>
  );
}
