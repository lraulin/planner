"use client";

import { useState } from "react";
import type { PriorityLetter } from "@/db/schema";
import {
  getHouseDetailAction,
  updateHouseAction,
} from "@/app/(shell)/library/houses/actions";
import { DrawerFooter, DrawerLeaveGuard } from "@/components/detail/Drawer";
import { RecordDrawer } from "@/components/detail/RecordDrawer";
import { useDrawerForm } from "@/components/detail/useDrawerForm";
import { FormTabs } from "@/components/detail/FormTabs";
import { catalogNotesTab } from "@/components/detail/catalogNotesTab";
import {
  DecimalField,
  FieldGrid,
  MoneyField,
  NumberField,
  PriorityField,
  SelectField,
  Section,
  TextField,
} from "@/components/detail/fields";
import {
  HOUSE_STATUS_LABELS,
  type HouseDetail,
  type HouseInput,
} from "@/lib/houses/types";
import { HOUSE_STATUSES } from "@/db/schema";

type TabId = "details" | "notes";

const STATUS_OPTIONS = HOUSE_STATUSES.map((status) => ({
  value: status,
  label: HOUSE_STATUS_LABELS[status],
}));

const TRI_STATE_OPTIONS = [
  { value: "yes" as const, label: "Yes" },
  { value: "no" as const, label: "No" },
];

function triStateOf(value: boolean | null): "yes" | "no" | null {
  return value === null ? null : value ? "yes" : "no";
}

function centsToMoneyString(cents: number | null): string | null {
  return cents === null ? null : (cents / 100).toFixed(2);
}

function moneyStringToCents(value: string | null): number | null {
  return value === null ? null : Math.round(Number(value) * 100);
}

/**
 * The drawer only ever edits an existing house, so `external` — `HouseInput`'s keyed-create
 * field for the MCP tools — has no place in the draft.
 */
type HouseDraft = Required<Omit<HouseInput, "external">>;

function draftOf(detail: HouseDetail): HouseDraft {
  return {
    nickname: detail.nickname,
    listingUrl: detail.listingUrl,
    streetAddress: detail.streetAddress,
    city: detail.city,
    state: detail.state,
    postalCode: detail.postalCode,
    askingPriceCents: detail.askingPriceCents,
    hoaFeeCents: detail.hoaFeeCents,
    propertyTaxCents: detail.propertyTaxCents,
    squareFeet: detail.squareFeet,
    beds: detail.beds,
    baths: detail.baths === null ? null : Number(detail.baths),
    yearBuilt: detail.yearBuilt,
    lotAcres: detail.lotAcres === null ? null : Number(detail.lotAcres),
    hasFence: detail.hasFence,
    hasBasement: detail.hasBasement,
    hasGarage: detail.hasGarage,
    status: detail.status,
    priorityLetter: detail.priorityLetter,
    priorityRank: detail.priorityRank,
    notes: detail.notes,
  };
}

/** The house's name wherever it is shown: its grid row, its drawer, the delete confirm. */
export function houseName(
  house: Pick<HouseDetail, "nickname" | "streetAddress">,
): string {
  return house.nickname || house.streetAddress || "Untitled house";
}

/** Explicit-save House form, following the shared structured drawer pattern. */
export function HouseDrawer({
  houseId,
  onClose,
  onChanged,
}: {
  houseId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  return (
    <RecordDrawer
      recordId={houseId}
      load={getHouseDetailAction}
      noun="house"
      titleOf={houseName}
      onClose={onClose}
    >
      {(detail) => (
        <HouseForm detail={detail} onClose={onClose} onChanged={onChanged} />
      )}
    </RecordDrawer>
  );
}

function HouseForm({
  detail,
  onClose,
  onChanged,
}: {
  detail: HouseDetail;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { draft, patch, dirty, footer } = useDrawerForm({
    initial: () => draftOf(detail),
    persist: (next) => updateHouseAction(detail.id, next),
    onChanged,
    onClose,
  });
  const [tab, setTab] = useState<TabId>("details");

  function patchPriority(letter: PriorityLetter | null, rank: number | null) {
    patch("priorityLetter", letter);
    patch("priorityRank", rank);
  }

  const tabs = [
    {
      id: "details" as const,
      label: "Details",
      render: () => (
        <>
          <Section title="Listing">
            <FieldGrid>
              <TextField
                label="Nickname"
                value={draft.nickname}
                onChange={(value) => patch("nickname", value)}
              />
              <TextField
                label="Listing URL"
                value={draft.listingUrl}
                onChange={(value) => patch("listingUrl", value)}
              />
            </FieldGrid>
          </Section>

          <Section title="Address">
            <TextField
              label="Street"
              value={draft.streetAddress}
              onChange={(value) => patch("streetAddress", value)}
            />
            <FieldGrid columns={3}>
              <TextField
                label="City"
                value={draft.city}
                onChange={(value) => patch("city", value)}
              />
              <TextField
                label="State"
                value={draft.state}
                onChange={(value) => patch("state", value)}
              />
              <TextField
                label="Postal code"
                value={draft.postalCode}
                onChange={(value) => patch("postalCode", value)}
              />
            </FieldGrid>
          </Section>

          <Section title="Price">
            <FieldGrid columns={3}>
              <MoneyField
                label="Asking price"
                value={centsToMoneyString(draft.askingPriceCents)}
                onChange={(value) =>
                  patch("askingPriceCents", moneyStringToCents(value))
                }
              />
              <MoneyField
                label="HOA fee (monthly)"
                value={centsToMoneyString(draft.hoaFeeCents)}
                onChange={(value) => patch("hoaFeeCents", moneyStringToCents(value))}
              />
              <MoneyField
                label="Property tax (annual)"
                value={centsToMoneyString(draft.propertyTaxCents)}
                onChange={(value) =>
                  patch("propertyTaxCents", moneyStringToCents(value))
                }
              />
            </FieldGrid>
          </Section>

          <Section title="Size">
            <FieldGrid columns={3}>
              <NumberField
                label="Square feet"
                value={draft.squareFeet}
                min={0}
                max={50_000}
                onChange={(value) => patch("squareFeet", value)}
              />
              <NumberField
                label="Beds"
                value={draft.beds}
                min={0}
                max={20}
                onChange={(value) => patch("beds", value)}
              />
              <DecimalField
                label="Baths"
                value={draft.baths === null ? null : String(draft.baths)}
                decimals={1}
                onChange={(value) =>
                  patch("baths", value === null ? null : Number(value))
                }
              />
              <NumberField
                label="Year built"
                value={draft.yearBuilt}
                min={1600}
                max={2100}
                onChange={(value) => patch("yearBuilt", value)}
              />
              <DecimalField
                label="Lot acres"
                value={draft.lotAcres === null ? null : String(draft.lotAcres)}
                decimals={3}
                onChange={(value) =>
                  patch("lotAcres", value === null ? null : Number(value))
                }
              />
            </FieldGrid>
          </Section>

          <Section title="Features">
            <FieldGrid columns={3}>
              <SelectField
                label="Fence"
                value={triStateOf(draft.hasFence)}
                options={TRI_STATE_OPTIONS}
                allowEmpty
                emptyLabel="Unknown"
                onChange={(value) =>
                  patch("hasFence", value === null ? null : value === "yes")
                }
              />
              <SelectField
                label="Basement"
                value={triStateOf(draft.hasBasement)}
                options={TRI_STATE_OPTIONS}
                allowEmpty
                emptyLabel="Unknown"
                onChange={(value) =>
                  patch("hasBasement", value === null ? null : value === "yes")
                }
              />
              <SelectField
                label="Garage"
                value={triStateOf(draft.hasGarage)}
                options={TRI_STATE_OPTIONS}
                allowEmpty
                emptyLabel="Unknown"
                onChange={(value) =>
                  patch("hasGarage", value === null ? null : value === "yes")
                }
              />
            </FieldGrid>
          </Section>

          <Section title="Triage">
            <FieldGrid>
              <SelectField
                label="Status"
                value={draft.status}
                options={STATUS_OPTIONS}
                onChange={(value) => patch("status", value ?? "available")}
              />
              <PriorityField
                letter={draft.priorityLetter}
                rank={draft.priorityRank}
                onChange={patchPriority}
              />
            </FieldGrid>
          </Section>
        </>
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
