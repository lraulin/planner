"use client";

import { useEffect, useId, useState, useTransition } from "react";
import type { PriorityLetter } from "@/db/schema";
import { getHouseDetailAction, updateHouseAction } from "@/app/library/houses/actions";
import {
  Drawer,
  DrawerFooter,
  DrawerHeader,
  DrawerLeaveGuard,
} from "@/components/detail/Drawer";
import { FormTabs } from "@/components/detail/FormTabs";
import {
  DecimalField,
  FieldGrid,
  MoneyField,
  NumberField,
  PriorityField,
  SelectField,
  Section,
  TextArea,
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
  const titleId = useId();
  const [loaded, setLoaded] = useState<{
    houseId: string;
    detail: HouseDetail | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!houseId) return;
    let current = true;
    void getHouseDetailAction(houseId).then(
      (result) => {
        if (!current) return;
        if (!result.ok) setLoaded({ houseId, detail: null, error: result.error });
        else if (!result.data) {
          setLoaded({ houseId, detail: null, error: "That house no longer exists." });
        } else {
          setLoaded({ houseId, detail: result.data, error: null });
        }
      },
      () => {
        if (current)
          setLoaded({ houseId, detail: null, error: "Could not load this house." });
      },
    );
    return () => {
      current = false;
    };
  }, [houseId]);

  if (!houseId) return null;
  const current = loaded?.houseId === houseId ? loaded : null;

  return (
    <Drawer open onClose={onClose} labelledBy={titleId}>
      <DrawerHeader
        titleId={titleId}
        eyebrow="House"
        title={
          current?.detail?.nickname ||
          current?.detail?.streetAddress ||
          (current?.error ? "Could not open" : "Loading…")
        }
        onClose={onClose}
      />
      {current?.error ? (
        <p role="alert" className="px-5 py-4 text-[0.875rem] text-priority-a">
          {current.error}
        </p>
      ) : current?.detail ? (
        <HouseForm
          key={current.detail.id}
          detail={current.detail}
          onClose={onClose}
          onChanged={onChanged}
        />
      ) : null}
    </Drawer>
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
  const [draft, setDraft] = useState(() => draftOf(detail));
  const [tab, setTab] = useState<TabId>("details");
  const [dirty, setDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startTransition] = useTransition();

  function patch<K extends keyof HouseDraft>(key: K, value: HouseDraft[K]) {
    setJustSaved(false);
    setDirty(true);
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function patchPriority(letter: PriorityLetter | null, rank: number | null) {
    setJustSaved(false);
    setDirty(true);
    setDraft((current) => ({ ...current, priorityLetter: letter, priorityRank: rank }));
  }

  function save(thenClose: boolean) {
    setError(null);
    startTransition(async () => {
      if (dirty) {
        const result = await updateHouseAction(detail.id, draft);
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
