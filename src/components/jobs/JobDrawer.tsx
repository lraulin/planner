"use client";

import { useState } from "react";
import {
  getJobDetailAction,
  updateJobAction,
} from "@/app/(shell)/library/jobs/actions";
import { DrawerFooter, DrawerLeaveGuard } from "@/components/detail/Drawer";
import { RecordDrawer } from "@/components/detail/RecordDrawer";
import { useDrawerForm } from "@/components/detail/useDrawerForm";
import { FormTabs } from "@/components/detail/FormTabs";
import { catalogNotesTab } from "@/components/detail/catalogNotesTab";
import {
  CheckboxField,
  ComboboxField,
  DateKeyField,
  FieldGrid,
  MoneyField,
  Section,
  TextArea,
  TextField,
} from "@/components/detail/fields";
import { EMPLOYMENT_TYPES, PAY_PERIODS } from "@/lib/jobs/vocabulary";
import type { JobDetail, JobInput } from "@/lib/jobs/types";

type TabId = "position" | "employer" | "supervisor" | "notes";

function draftOf(detail: JobDetail): Required<JobInput> {
  return {
    employer: detail.employer,
    jobTitle: detail.jobTitle,
    employmentType: detail.employmentType,
    startDate: detail.startDate,
    endDate: detail.endDate,
    duties: detail.duties,
    reasonForLeaving: detail.reasonForLeaving,
    startingPay: detail.startingPay,
    endingPay: detail.endingPay,
    payPeriod: detail.payPeriod,
    phone: detail.phone,
    streetAddress: detail.streetAddress,
    extendedAddress: detail.extendedAddress,
    city: detail.city,
    region: detail.region,
    postalCode: detail.postalCode,
    country: detail.country,
    countryCode: detail.countryCode,
    supervisorName: detail.supervisorName,
    supervisorTitle: detail.supervisorTitle,
    supervisorPhone: detail.supervisorPhone,
    supervisorEmail: detail.supervisorEmail,
    mayContactSupervisor: detail.mayContactSupervisor,
    notes: detail.notes,
  };
}

/** The job's name wherever it is shown: its grid row, its drawer, the delete confirm. */
export function jobName(job: Pick<JobDetail, "employer">): string {
  return job.employer || "Untitled job";
}

/** Explicit-save Job form, following the shared structured drawer pattern. */
export function JobDrawer({
  jobId,
  onClose,
  onChanged,
}: {
  jobId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  return (
    <RecordDrawer
      recordId={jobId}
      load={getJobDetailAction}
      noun="job"
      titleOf={jobName}
      onClose={onClose}
    >
      {(detail) => <JobForm detail={detail} onClose={onClose} onChanged={onChanged} />}
    </RecordDrawer>
  );
}

function JobForm({
  detail,
  onClose,
  onChanged,
}: {
  detail: JobDetail;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { draft, patch, dirty, footer } = useDrawerForm({
    initial: () => draftOf(detail),
    persist: (next) => updateJobAction(detail.id, next),
    onChanged,
    onClose,
  });
  const [tab, setTab] = useState<TabId>("position");

  const tabs = [
    {
      id: "position" as const,
      label: "Position",
      render: () => (
        <>
          <Section title="Role">
            <FieldGrid>
              <TextField
                label="Employer"
                value={draft.employer}
                onChange={(value) => patch("employer", value)}
              />
              <TextField
                label="Job title"
                value={draft.jobTitle}
                onChange={(value) => patch("jobTitle", value)}
              />
              <ComboboxField
                label="Employment type"
                value={draft.employmentType}
                options={EMPLOYMENT_TYPES}
                onChange={(value) => patch("employmentType", value)}
              />
            </FieldGrid>
          </Section>

          <Section title="Dates">
            <FieldGrid>
              <DateKeyField
                label="Started"
                value={draft.startDate}
                onChange={(value) => patch("startDate", value)}
              />
              <DateKeyField
                label="Ended"
                value={draft.endDate}
                onChange={(value) => patch("endDate", value)}
                hint="Leave blank if this is your current job."
              />
            </FieldGrid>
          </Section>

          <Section title="Pay">
            <FieldGrid columns={3}>
              <MoneyField
                label="Starting pay"
                value={draft.startingPay}
                onChange={(value) => patch("startingPay", value)}
              />
              <MoneyField
                label="Ending pay"
                value={draft.endingPay}
                onChange={(value) => patch("endingPay", value)}
              />
              <ComboboxField
                label="Per"
                value={draft.payPeriod}
                options={PAY_PERIODS}
                onChange={(value) => patch("payPeriod", value)}
              />
            </FieldGrid>
          </Section>

          <Section title="Duties">
            <TextArea
              label="What the role involved"
              rows={5}
              value={draft.duties}
              onChange={(value) => patch("duties", value)}
            />
            <TextField
              label="Reason for leaving"
              value={draft.reasonForLeaving}
              onChange={(value) => patch("reasonForLeaving", value)}
            />
          </Section>
        </>
      ),
    },
    {
      id: "employer" as const,
      label: "Employer",
      render: () => (
        <Section title="Address">
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
          <TextField
            label="Phone"
            value={draft.phone}
            onChange={(value) => patch("phone", value)}
          />
        </Section>
      ),
    },
    {
      id: "supervisor" as const,
      label: "Supervisor",
      render: () => (
        <Section title="Who you reported to">
          <FieldGrid>
            <TextField
              label="Name"
              value={draft.supervisorName}
              onChange={(value) => patch("supervisorName", value)}
            />
            <TextField
              label="Title"
              value={draft.supervisorTitle}
              onChange={(value) => patch("supervisorTitle", value)}
            />
            <TextField
              label="Phone"
              value={draft.supervisorPhone}
              onChange={(value) => patch("supervisorPhone", value)}
            />
            <TextField
              label="Email"
              value={draft.supervisorEmail}
              onChange={(value) => patch("supervisorEmail", value)}
            />
          </FieldGrid>
          <CheckboxField
            label="May be contacted"
            checked={draft.mayContactSupervisor}
            onChange={(value) => patch("mayContactSupervisor", value)}
            hint="Applications ask this per employer, and the answer is not always yes."
          />
        </Section>
      ),
    },
    catalogNotesTab(draft.notes, (value) => patch("notes", value)),
  ];

  return (
    <>
      <FormTabs tabs={tabs} active={tab} onSelect={(id) => setTab(id as TabId)} />
      <DrawerLeaveGuard dirty={dirty} />
      <DrawerFooter {...footer} />
    </>
  );
}
