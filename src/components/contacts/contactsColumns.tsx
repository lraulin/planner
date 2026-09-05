"use client";

import type { ColumnDef } from "@/components/grid/columns";
import type { ContactListRow } from "@/lib/contacts/types";
import { DateText } from "@/components/date/DateText";
import { localDateKey } from "@/lib/schedule/geometry";

/**
 * The Contacts grid's columns. Read-only, unlike the other list grids: a contact's fields
 * are name *parts* and typed sub-records, and neither survives being flattened into an
 * inline text input. Editing is the drawer.
 */
export type ContactsColumnCtx = {
  onOpen: (row: ContactListRow) => void;
};

export const CONTACTS_COLUMN_IDS = [
  "name",
  "company",
  "phone",
  "email",
  "city",
  "group",
  "contexts",
  "open",
] as const;

function Text({ value, muted }: { value: string; muted?: boolean }) {
  return (
    <span
      className={`truncate text-[0.8125rem] ${muted ? "text-ink-muted" : "text-ink"}`}
      title={value || undefined}
    >
      {value}
    </span>
  );
}

export const contactsColumns: ColumnDef<ContactsColumnCtx, ContactListRow>[] = [
  {
    id: "name",
    label: "Name",
    width: "17rem",
    hideable: false,
    filterKind: "text",
    filterValue: (row) => row.node.displayName || null,
    // Sorts by file-as, not by what is displayed: a list of people belongs in surname
    // order even though the cell reads "Ada King".
    sortValue: (row) => row.node.fileAs.toLowerCase(),
    compact: "primary",
    render: (row) => (
      <span className="truncate text-[0.8125rem] font-medium text-ink">
        {row.node.displayName}
      </span>
    ),
  },
  {
    id: "company",
    label: "Company",
    width: "13rem",
    filterKind: "text",
    filterValue: (row) => row.node.company || null,
    sortValue: (row) => row.node.company.toLowerCase(),
    render: (row) => <Text value={row.node.company} muted />,
  },
  {
    id: "jobTitle",
    label: "Job Title",
    width: "13rem",
    filterKind: "text",
    filterValue: (row) => row.node.jobTitle || null,
    sortValue: (row) => row.node.jobTitle.toLowerCase(),
    render: (row) => <Text value={row.node.jobTitle} muted />,
  },
  {
    id: "phone",
    label: "Phone",
    width: "10rem",
    filterKind: "text",
    filterValue: (row) => row.node.primaryPhone || null,
    sortValue: (row) => row.node.primaryPhone,
    compact: "meta",
    render: (row) =>
      row.node.primaryPhone ? (
        <a
          href={`tel:${row.node.primaryPhone.replace(/[^+\d]/g, "")}`}
          onClick={(event) => event.stopPropagation()}
          title={row.node.primaryPhoneLabel || undefined}
          className="truncate text-[0.8125rem] text-ink hover:underline"
        >
          {row.node.primaryPhone}
        </a>
      ) : null,
  },
  {
    id: "email",
    label: "E-mail",
    width: "16rem",
    filterKind: "text",
    filterValue: (row) => row.node.primaryEmail || null,
    sortValue: (row) => row.node.primaryEmail.toLowerCase(),
    compact: "meta",
    render: (row) =>
      row.node.primaryEmail ? (
        <a
          href={`mailto:${row.node.primaryEmail}`}
          onClick={(event) => event.stopPropagation()}
          title={row.node.primaryEmailLabel || undefined}
          className="truncate text-[0.8125rem] text-ink hover:underline"
        >
          {row.node.primaryEmail}
        </a>
      ) : null,
  },
  {
    id: "city",
    label: "City",
    width: "8rem",
    filterKind: "text",
    filterValue: (row) => row.node.primaryCity || null,
    sortValue: (row) => row.node.primaryCity.toLowerCase(),
    render: (row) => <Text value={row.node.primaryCity} muted />,
  },
  {
    id: "group",
    label: "Group",
    width: "8rem",
    filterKind: "enum",
    filterValue: (row) => row.node.groupName || null,
    sortValue: (row) => row.node.groupName.toLowerCase(),
    render: (row) => <Text value={row.node.groupName} muted />,
  },
  {
    id: "contexts",
    label: "Contexts",
    width: "9rem",
    filterKind: "text",
    filterValue: (row) => row.node.contexts.join(", ") || null,
    render: (row) => <Text value={row.node.contexts.join(", ")} muted />,
  },
  {
    id: "open",
    label: "Open",
    width: "4rem",
    align: "right",
    fieldLabel: "Open discussion items",
    // Blank at zero. A column of noughts down every row is noise; the point of the column
    // is to make the handful of people you owe a conversation visible at a glance.
    filterKind: "text",
    filterValue: (row) =>
      row.node.openItemCount > 0 ? String(row.node.openItemCount) : null,
    sortValue: (row) => row.node.openItemCount,
    compactText: (row) =>
      row.node.openItemCount > 0 ? `${row.node.openItemCount} to raise` : null,
    render: (row) =>
      row.node.openItemCount > 0 ? (
        <span className="tabular text-[0.8125rem] font-medium text-ink">
          {row.node.openItemCount}
        </span>
      ) : null,
  },
  {
    id: "updated",
    label: "Updated",
    width: "7rem",
    filterKind: "date",
    filterValue: (row) => localDateKey(row.node.updatedAt),
    sortValue: (row) => row.node.updatedAt.getTime(),
    compact: "hidden",
    render: (row) => (
      <DateText
        dateKey={localDateKey(row.node.updatedAt)}
        className="tabular text-[0.8125rem] text-ink-muted"
      />
    ),
  },
];
