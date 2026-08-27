"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Drawer, DrawerFooter, DrawerHeader } from "@/components/detail/Drawer";
import { formatUsd } from "@/lib/finances/money";
import {
  approveAmazonChargeMatchAction,
  listAmazonChargeCandidatesAction,
  listAmazonReviewItemsAction,
} from "@/app/finances/actions";
import type { AmazonChargeCandidate } from "@/lib/amazon/apply";
import type { AmazonReviewRow } from "@/lib/amazon/queries";

export function AmazonReviewDrawer({
  open,
  focusChargeId,
  onClose,
}: {
  open: boolean;
  focusChargeId: string | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<AmazonReviewRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<AmazonChargeCandidate[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const selected = items.find((row) => row.id === selectedId) ?? null;

  function selectItem(row: AmazonReviewRow | null) {
    setSelectedId(row?.id ?? null);
    setDirty(false);
    setJustSaved(false);
    if (!row || row.kind !== "charge") {
      setCandidates([]);
      setPicked(null);
      return;
    }
    startTransition(async () => {
      const found = await listAmazonChargeCandidatesAction(row.id);
      if (!found.ok) {
        setError(found.error);
        return;
      }
      setCandidates(found.data);
      setPicked(found.data[0]?.id ?? null);
    });
  }

  useEffect(() => {
    if (!open) return;
    startTransition(async () => {
      const listed = await listAmazonReviewItemsAction();
      if (!listed.ok) {
        setError(listed.error);
        return;
      }
      setItems(listed.data);
      const focused =
        (focusChargeId ? listed.data.find((row) => row.id === focusChargeId) : null) ??
        listed.data[0] ??
        null;
      setSelectedId(focused?.id ?? null);
      if (focused?.kind === "charge") {
        const found = await listAmazonChargeCandidatesAction(focused.id);
        if (!found.ok) {
          setError(found.error);
          return;
        }
        setCandidates(found.data);
        setPicked(found.data[0]?.id ?? null);
        return;
      }
      setCandidates([]);
      setPicked(null);
    });
  }, [open, focusChargeId]);

  function save(close: boolean) {
    if (!selected || selected.kind !== "charge" || !picked) {
      if (close) onClose();
      return;
    }
    setError(null);
    setSaving(true);
    startTransition(async () => {
      const result = await approveAmazonChargeMatchAction(selected.id, picked);
      if (!result.ok) {
        setError(result.error);
        setSaving(false);
        return;
      }
      setDirty(false);
      setJustSaved(true);
      const listed = await listAmazonReviewItemsAction();
      if (listed.ok) {
        setItems(listed.data);
        selectItem(listed.data[0] ?? null);
      }
      router.refresh();
      setSaving(false);
      if (close) onClose();
    });
  }

  const lineTotal =
    selected?.lines.reduce((sum, line) => sum + (line.itemPaidCents ?? 0), 0) ?? 0;

  return (
    <Drawer open={open} onClose={onClose} labelledBy={titleId}>
      <DrawerHeader
        titleId={titleId}
        eyebrow="Amazon"
        title="Review matches"
        onClose={onClose}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[0.875rem] text-ink">
        {items.length === 0 ? (
          <p className="text-ink-muted">No unresolved Amazon evidence.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => selectItem(row)}
                  className={`min-h-tap w-full rounded border px-3 py-2 text-left md:min-h-0 ${
                    row.id === selectedId
                      ? "border-ink bg-surface-raised"
                      : "border-rule"
                  }`}
                >
                  <div className="font-medium">{row.title}</div>
                  <div className="text-[0.75rem] text-ink-muted">
                    {row.amountCents !== null ? `${formatUsd(row.amountCents)} · ` : ""}
                    {row.reason}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {selected?.kind === "charge" && (
          <div className="mt-4 space-y-3">
            <p className="text-[0.75rem] font-semibold uppercase tracking-wider text-ink-muted">
              Order items
            </p>
            <p className="text-ink-muted">
              Items in an order add up to what the card was charged. Match this total to
              the posted Amazon row of the same amount.
            </p>
            {selected.lines.length === 0 ? (
              <p className="text-ink-muted">No line items on the linked orders yet.</p>
            ) : (
              <ul className="space-y-1">
                {selected.lines.map((line, index) => (
                  <li
                    key={`${line.amazonOrderId}:${index}`}
                    className="flex justify-between gap-3"
                  >
                    <span className="min-w-0 truncate">
                      {selected.amazonOrderIds.length > 1
                        ? `${line.amazonOrderId} · ${line.productName}`
                        : line.productName}
                    </span>
                    <span className="tabular text-ink-muted">
                      {line.itemPaidCents === null
                        ? "—"
                        : formatUsd(line.itemPaidCents)}
                    </span>
                  </li>
                ))}
                <li className="flex justify-between gap-3 border-t border-rule pt-1 font-medium">
                  <span>Order total</span>
                  <span className="tabular">{formatUsd(lineTotal)}</span>
                </li>
              </ul>
            )}
            <p className="text-[0.75rem] font-semibold uppercase tracking-wider text-ink-muted">
              Card charge of the same amount
            </p>
            {candidates.length === 0 ? (
              <p className="text-ink-muted">
                No posted Amazon row of {formatUsd(selected.amountCents ?? lineTotal)}{" "}
                to approve.
              </p>
            ) : (
              candidates.map((row) => (
                <label
                  key={row.id}
                  className="flex min-h-tap items-start gap-2 md:min-h-0"
                >
                  <input
                    type="radio"
                    name="amazon-candidate"
                    checked={picked === row.id}
                    onChange={() => {
                      setPicked(row.id);
                      setDirty(true);
                      setJustSaved(false);
                    }}
                    className="mt-1"
                  />
                  <span>
                    {row.transactionDate} · {row.description} ·{" "}
                    {formatUsd(row.amountCents)}
                    {row.dateMismatch ? " · date differs" : ""}
                  </span>
                </label>
              ))
            )}
          </div>
        )}
        {selected?.kind === "subscription" && (
          <p className="mt-4 text-ink-muted">
            Amount, cadence or cancellation changes are recorded here and are never
            applied automatically. Edit the Bill on the budget if the new Amazon values
            are right.
          </p>
        )}
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
    </Drawer>
  );
}
