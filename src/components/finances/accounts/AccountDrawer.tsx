"use client";

import { useId, useState, useTransition } from "react";
import { updateAccountAction } from "@/app/finances/actions";
import type { AccountEdit } from "@/lib/finances/mutations";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import { Drawer, DrawerFooter, DrawerHeader } from "@/components/detail/Drawer";
import {
  CheckboxField,
  FieldGrid,
  Section,
  SelectField,
  TextField,
} from "@/components/detail/fields";
import {
  ACCOUNT_KIND_OPTIONS,
  accountSourceLabel,
  isCoreBudgetKind,
} from "@/lib/finances/accountKind";
import { formatUsd } from "@/lib/finances/money";
import type { FinanceAccountRow } from "@/lib/finances/types";
import type { FinanceAccountKind } from "@/db/schema";
import { useToday } from "@/components/grid/useToday";

type Draft = {
  name: string;
  kind: FinanceAccountKind;
  institution: string;
  url: string;
  closed: boolean;
  offBudget: boolean;
};

function draftOf(account: FinanceAccountRow): Draft {
  return {
    name: account.name,
    kind: account.kind,
    institution: account.institution,
    url: account.url,
    closed: account.closedAt !== null,
    offBudget: account.offBudget,
  };
}

export function AccountDrawer({
  account,
  onClose,
  onChanged,
}: {
  account: FinanceAccountRow | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const titleId = useId();

  if (!account) return null;

  return (
    <AccountForm
      key={account.id}
      account={account}
      titleId={titleId}
      onClose={onClose}
      onChanged={onChanged}
    />
  );
}

function AccountForm({
  account,
  titleId,
  onClose,
  onChanged,
}: {
  account: FinanceAccountRow;
  titleId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const today = useToday();
  const [draft, setDraft] = useState(() => draftOf(account));
  const [savedClosed, setSavedClosed] = useState(account.closedAt !== null);
  const [dirty, setDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [saving, startTransition] = useTransition();

  function patch<K extends keyof Draft>(key: K, value: Draft[K]) {
    setJustSaved(false);
    setDirty(true);
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function requestClose() {
    if (dirty) setConfirmClose(true);
    else onClose();
  }

  function save(thenClose: boolean) {
    setError(null);
    startTransition(async () => {
      if (dirty) {
        const edit: AccountEdit = {
          name: draft.name,
          kind: draft.kind,
          institution: draft.institution,
          url: draft.url,
          offBudget: draft.offBudget,
        };
        if (draft.closed !== savedClosed) {
          if (draft.closed && today === null) {
            setError("Could not read today's date.");
            return;
          }
          edit.closedOn = draft.closed ? today : null;
        }
        const result = await updateAccountAction(account.id, edit);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setSavedClosed(draft.closed);
        setDirty(false);
        onChanged();
      }
      if (thenClose) onClose();
      else setJustSaved(true);
    });
  }

  return (
    <>
      <Drawer open onClose={requestClose} labelledBy={titleId}>
        <DrawerHeader
          titleId={titleId}
          eyebrow="Account"
          title={draft.name || account.name}
          onClose={requestClose}
        />
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-6">
            <Section title="Account">
              <FieldGrid>
                <TextField
                  label="Name"
                  value={draft.name}
                  onChange={(value) => patch("name", value)}
                />
                <SelectField
                  label="Kind"
                  value={draft.kind}
                  options={ACCOUNT_KIND_OPTIONS}
                  onChange={(value) => {
                    if (!value) return;
                    setJustSaved(false);
                    setDirty(true);
                    setDraft((current) => ({
                      ...current,
                      kind: value,
                      offBudget: isCoreBudgetKind(value) ? false : current.offBudget,
                    }));
                  }}
                />
                <TextField
                  label="Institution"
                  value={draft.institution}
                  onChange={(value) => patch("institution", value)}
                />
                <TextField
                  label="URL"
                  value={draft.url}
                  onChange={(value) => patch("url", value)}
                  hint="https link to this account at the bank. Empty clears the name-link."
                />
              </FieldGrid>
              <CheckboxField
                label="Closed"
                checked={draft.closed}
                onChange={(checked) => patch("closed", checked)}
                hint="Closed accounts stay in the register and drop off the dashboard."
              />
              {isCoreBudgetKind(draft.kind) ? (
                <p className="text-[0.8125rem] leading-snug text-ink-muted">
                  On budget. Checking, savings, cash and credit cards always join the
                  envelope pool. Assigning to a Savings envelope is what gives money a
                  savings job; moving it to a savings account does not. Closing this
                  account does not remove a remaining balance from the pool.
                </p>
              ) : (
                <CheckboxField
                  label="On budget"
                  checked={!draft.offBudget}
                  onChange={(checked) => patch("offBudget", !checked)}
                  hint="When on, this account's working balance is money to assign and its transactions are budget activity. Changing this rebases the budget opening by this account's position just before the budget started, once."
                />
              )}
            </Section>

            <Section title="Identity">
              <p className="text-[0.8125rem] text-ink-muted">
                Last four <span className="text-ink">{account.externalKey}</span>
                {" · "}
                {accountSourceLabel(account.externalSource)}
                {" · "}
                {formatUsd(account.balanceCents)}
                {" · "}
                {account.transactionCount} transactions
              </p>
              <p className="text-[0.75rem] text-ink-faint">
                Importers match on the last four and the feed, never the name. Changing
                those here would fork the account on the next import.
              </p>
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
        message="You have unsaved changes. Close without saving?"
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
