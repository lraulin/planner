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
  onClose,
}: {
  open: boolean;
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
      const first = listed.data[0] ?? null;
      setSelectedId(first?.id ?? null);
      if (first?.kind === "charge") {
        const found = await listAmazonChargeCandidatesAction(first.id);
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
  }, [open]);

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
                  <div className="text-[0.75rem] text-ink-muted">{row.reason}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {selected?.kind === "charge" && (
          <div className="mt-4 space-y-2">
            <p className="text-[0.75rem] font-semibold uppercase tracking-wider text-ink-muted">
              Equal-amount Amazon rows
            </p>
            {candidates.length === 0 ? (
              <p className="text-ink-muted">No equal-amount Amazon row to approve.</p>
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
