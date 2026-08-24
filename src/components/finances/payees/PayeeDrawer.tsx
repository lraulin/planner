"use client";

import { useId, useState, useTransition } from "react";
import {
  addPayeeAliasAction,
  removePayeeAliasAction,
  updatePayeeDetailsAction,
} from "@/app/finances/actions";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import { Drawer, DrawerFooter, DrawerHeader } from "@/components/detail/Drawer";
import { CheckboxField, Section, TextArea } from "@/components/detail/fields";
import { formatUsd } from "@/lib/finances/money";
import type { PayeeRow } from "@/lib/finances/payees/queries";

function claimLabel(payee: PayeeRow): string {
  if (!payee.claim) return "Not claimed";
  const kind = payee.claim.kind === "bill" ? "Subscription / bill" : "Recurring spend";
  return `${kind} · ${payee.claim.name}`;
}

export function PayeeDrawer({
  payee,
  onClose,
  onChanged,
}: {
  payee: PayeeRow | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const titleId = useId();
  if (!payee) return null;

  return (
    <PayeeForm
      key={payee.id}
      payee={payee}
      titleId={titleId}
      onClose={onClose}
      onChanged={onChanged}
    />
  );
}

function PayeeForm({
  payee,
  titleId,
  onClose,
  onChanged,
}: {
  payee: PayeeRow;
  titleId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const aliasId = useId();
  const nameId = useId();
  const [name, setName] = useState(payee.name);
  const [notes, setNotes] = useState(payee.notes);
  const [learnCategories, setLearnCategories] = useState(payee.learnCategories ?? true);
  const [aliasDraft, setAliasDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aliasNotice, setAliasNotice] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [saving, startTransition] = useTransition();

  function requestClose() {
    if (dirty) setConfirmClose(true);
    else onClose();
  }

  function patchNotes(value: string) {
    setNotes(value);
    setDirty(value !== payee.notes || name !== payee.name);
    setJustSaved(false);
  }

  function patchName(value: string) {
    setName(value);
    setDirty(value !== payee.name || notes !== payee.notes);
    setJustSaved(false);
  }

  function save(thenClose: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await updatePayeeDetailsAction(payee.id, {
        name,
        notes,
        learnCategories,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDirty(false);
      setJustSaved(true);
      if (thenClose) onClose();
      else onChanged();
    });
  }

  function addAlias() {
    if (aliasDraft.trim() === "") {
      setError("Enter the bank spelling this payee should answer to.");
      return;
    }
    setError(null);
    setAliasNotice(null);
    startTransition(async () => {
      const result = await addPayeeAliasAction(payee.id, aliasDraft);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAliasDraft("");
      setAliasNotice(
        "Spelling added. Rebuild from the register to apply it to charges.",
      );
      onChanged();
    });
  }

  function removeAlias(alias: string) {
    setError(null);
    setAliasNotice(null);
    startTransition(async () => {
      const result = await removePayeeAliasAction(payee.id, alias);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAliasNotice("Spelling removed. Rebuild after finishing these edits.");
      onChanged();
    });
  }

  return (
    <>
      <Drawer open onClose={requestClose} labelledBy={titleId}>
        <DrawerHeader
          titleId={titleId}
          eyebrow="Payee"
          title={payee.name}
          onClose={requestClose}
        />

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-7">
            <Section title="Identity">
              <label
                htmlFor={nameId}
                className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted"
              >
                Display name
                <input
                  id={nameId}
                  value={name}
                  onChange={(event) => patchName(event.target.value)}
                  className="min-h-tap rounded border border-rule bg-surface px-2 py-1.5 text-base font-normal normal-case tracking-normal text-ink outline-none focus:border-select-edge md:min-h-0 md:text-[0.8125rem]"
                />
              </label>
              <dl className="grid grid-cols-1 gap-3 rounded border border-rule bg-surface-raised/40 p-3 text-[0.8125rem] sm:grid-cols-3">
                <div>
                  <dt className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
                    Charges
                  </dt>
                  <dd className="mt-0.5 tabular-nums text-ink">
                    {payee.transactionCount.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
                    Register total
                  </dt>
                  <dd className="mt-0.5 tabular-nums text-ink">
                    {formatUsd(payee.totalCents)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
                    Commitment
                  </dt>
                  <dd className="mt-0.5 truncate text-ink" title={claimLabel(payee)}>
                    {claimLabel(payee)}
                  </dd>
                </div>
              </dl>
            </Section>

            <Section title="Answers to">
              <p className="text-[0.8125rem] leading-relaxed text-ink-muted">
                These are normalized bank spellings, not display names. One spelling can
                belong to only one payee.
              </p>

              {payee.aliases.length === 0 ? (
                <p className="rounded border border-dashed border-rule px-3 py-4 text-center text-[0.8125rem] text-ink-faint">
                  No spellings claimed. This payee cannot resolve onto a register row
                  yet.
                </p>
              ) : (
                <ul className="divide-y divide-rule rounded border border-rule">
                  {payee.aliases.map((alias) => (
                    <li
                      key={alias}
                      className="flex min-h-tap items-center gap-3 px-3 py-1.5 md:min-h-0"
                    >
                      <span className="min-w-0 flex-1 truncate font-mono text-[0.8125rem] text-ink">
                        {alias}
                      </span>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => removeAlias(alias)}
                        className="min-h-tap shrink-0 rounded px-2 text-[0.8125rem] text-ink-muted hover:bg-surface-raised hover:text-priority-a disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0 md:py-1"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <form
                className="flex flex-col gap-2 sm:flex-row sm:items-end"
                onSubmit={(event) => {
                  event.preventDefault();
                  addAlias();
                }}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <label
                    htmlFor={aliasId}
                    className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted"
                  >
                    Add a bank spelling
                  </label>
                  <input
                    id={aliasId}
                    value={aliasDraft}
                    onChange={(event) => setAliasDraft(event.target.value)}
                    placeholder="WM SUPERCENTER #1981"
                    className="min-h-tap w-full rounded border border-rule bg-surface px-2 py-1.5 font-mono text-[0.875rem] text-ink outline-none transition-colors focus:border-select-edge md:min-h-0"
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-tap rounded border border-rule px-3 py-1.5 text-[0.8125rem] text-ink hover:border-rule-strong hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0"
                >
                  Add spelling
                </button>
              </form>

              {aliasNotice && (
                <p className="text-[0.75rem] leading-relaxed text-ink-muted">
                  {aliasNotice}
                </p>
              )}
            </Section>

            <Section title="Notes">
              <CheckboxField
                label="Learn Categories from my choices"
                checked={learnCategories}
                onChange={(checked) => {
                  setLearnCategories(checked);
                  setDirty(true);
                  setJustSaved(false);
                }}
                hint="After the same Category appears on 3 of the latest 5 transactions, create or update this payee's rule."
              />
              <TextArea
                label="Notes"
                value={notes}
                rows={6}
                placeholder="Why these spellings belong together, or anything worth remembering."
                onChange={patchNotes}
              />
            </Section>
          </div>
        </div>

        <DrawerFooter
          onSave={() => save(false)}
          onSaveAndClose={() => save(true)}
          onClose={requestClose}
          saving={saving}
          dirty={dirty}
          justSaved={justSaved}
          error={error}
        />
      </Drawer>

      <ConfirmDialog
        open={confirmClose}
        title="Discard changes?"
        message="You have unsaved payee changes. Close without saving?"
        confirmLabel="Discard"
        destructive
        onConfirm={() => {
          setConfirmClose(false);
          setDirty(false);
          onClose();
        }}
        onCancel={() => setConfirmClose(false)}
      />
    </>
  );
}
