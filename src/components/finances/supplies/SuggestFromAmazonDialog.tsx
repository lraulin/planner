"use client";

import { useEffect, useId, useState, useTransition } from "react";
import {
  addSupplyOptionFromAmazonAction,
  createSupplyItemFromSuggestionAction,
  listAmazonSupplySuggestionsAction,
} from "@/app/finances/actions";
import { ModalShell } from "@/components/detail/ModalShell";
import { formatUsd } from "@/lib/finances/money";
import type { SupplyItemRow } from "@/lib/finances/supplies/queries";
import type { SupplySuggestion } from "@/lib/finances/supplies/suggestions";
import { SupplyItemPickerDialog } from "./SupplyItemPickerDialog";

/**
 * What the Amazon order history says you rebuy, offered as worksheet rows.
 *
 * A **prefill and not a sync**: accepting one creates an item and its in-use option and then
 * the dialog is done with it. The inferred rate is `units ÷ days observed`, which assumes a
 * steady pace between the first order and the last, so the evidence it was inferred from —
 * how many orders, over what span — sits on the row next to it. The user is expected to
 * correct the number in the grid afterwards, and cannot do that without seeing what it came
 * from.
 *
 * Closing discards nothing that was typed: there is nothing to type. Each Add is committed on
 * its own, so a half-finished pass keeps what it added.
 */
export function SuggestFromAmazonDialog({
  items,
  onClose,
  onAdded,
}: {
  items: readonly SupplyItemRow[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const headingId = useId();
  const [rows, setRows] = useState<SupplySuggestion[] | null>(null);
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());
  const [attaching, setAttaching] = useState<SupplySuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Mounted only while open, so the read happens once and nothing has to be reset here.
  useEffect(() => {
    startTransition(async () => {
      const result = await listAmazonSupplySuggestionsAction();
      if (result.ok) setRows(result.data);
      else setError(result.error);
    });
  }, []);

  function add(suggestion: SupplySuggestion) {
    setError(null);
    startTransition(async () => {
      const result = await createSupplyItemFromSuggestionAction({
        name: suggestion.name,
        rate:
          suggestion.rateBasis === "units_per_day"
            ? {
                rateBasis: "units_per_day",
                unitsPerDayMilli: suggestion.unitsPerDayMilli ?? 1,
              }
            : {
                rateBasis: "days_per_unit",
                daysPerUnitTenths: suggestion.daysPerUnitTenths ?? 1,
              },
        option: {
          vendor: "Amazon",
          brand: suggestion.name,
          qtyPerItem: suggestion.qtyPerItem,
          costPerOrderCents: suggestion.costPerOrderCents,
          pricedOn: suggestion.lastOrderDate,
          asin: suggestion.asin,
        },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAdded((current) => new Set(current).add(suggestion.asin));
      onAdded();
    });
  }

  function attach(suggestion: SupplySuggestion, itemId: string) {
    setError(null);
    startTransition(async () => {
      const result = await addSupplyOptionFromAmazonAction(itemId, suggestion.asin);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAttaching(null);
      setAdded((current) => new Set(current).add(suggestion.asin));
      onAdded();
    });
  }

  return (
    <>
      <ModalShell
        open={!attaching}
        onClose={onClose}
        labelledBy={headingId}
        width="max-w-3xl"
      >
        <div className="p-5">
          <h2 id={headingId} className="mb-1 text-[0.9375rem] font-semibold text-ink">
            Suggest from Amazon
          </h2>
          <p className="mb-3 text-[0.8125rem] text-ink-muted">
            Things you have ordered more than once, or on Subscribe &amp; Save. The rate
            is estimated from how much you bought over how long — correct it in the
            worksheet.
          </p>

          {error ? (
            <p className="mb-3 text-[0.8125rem] text-priority-a">{error}</p>
          ) : null}

          <div className="max-h-[55vh] overflow-auto rounded border border-rule">
            {rows === null ? (
              <p className="p-6 text-center text-[0.8125rem] text-ink-muted">
                Reading your order history…
              </p>
            ) : rows.length === 0 ? (
              <p className="p-6 text-center text-[0.8125rem] text-ink-muted">
                Nothing left to suggest — everything that repeats is already on the
                worksheet.
              </p>
            ) : (
              rows.map((row) => (
                <div
                  key={row.asin}
                  className="flex items-start gap-3 border-b border-rule px-3 py-2 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.8125rem] text-ink" title={row.name}>
                      {row.name}
                    </p>
                    <p className="text-[0.75rem] text-ink-muted">
                      {row.orderCount} order{row.orderCount === 1 ? "" : "s"} over{" "}
                      {row.spanDays} days · {formatUsd(row.costPerOrderCents)} each
                      {row.packCount === null ? "" : ` · ${row.packCount} per pack`}
                      {row.subscribeAndSave ? " · Subscribe & Save" : ""}
                    </p>
                    <p className="text-[0.75rem] text-ink-faint">
                      {row.rateBasis === "units_per_day"
                        ? `≈ ${((row.unitsPerDayMilli ?? 0) / 1000).toFixed(2)} units/day`
                        : `≈ one lasts ${((row.daysPerUnitTenths ?? 0) / 10).toFixed(0)} days`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <button
                      type="button"
                      disabled={pending || added.has(row.asin)}
                      className="min-h-tap rounded border border-rule px-3 text-[0.8125rem] text-ink hover:bg-surface-raised disabled:text-ink-faint md:min-h-0 md:py-1.5"
                      onClick={() => add(row)}
                    >
                      {added.has(row.asin) ? "Added" : "Add"}
                    </button>
                    {items.length > 0 && !added.has(row.asin) ? (
                      <button
                        type="button"
                        disabled={pending}
                        className="min-h-tap rounded border border-rule px-3 text-[0.8125rem] text-ink hover:bg-surface-raised disabled:text-ink-faint md:min-h-0 md:py-1.5"
                        onClick={() => setAttaching(row)}
                      >
                        Add to…
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              className="min-h-tap rounded border border-rule px-3 text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0 md:py-1.5"
              onClick={onClose}
            >
              Done
            </button>
          </div>
        </div>
      </ModalShell>
      {attaching ? (
        <SupplyItemPickerDialog
          items={items}
          title="Add to existing item"
          description="The offer lands on the item you pick. That item's rate, group, and envelope stay as they are."
          onClose={() => setAttaching(null)}
          onPick={(choice) => {
            if (choice.kind === "existing") attach(attaching, choice.itemId);
          }}
        />
      ) : null}
    </>
  );
}
