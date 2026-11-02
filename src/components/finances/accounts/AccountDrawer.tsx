"use client";

import { type ReactNode, useId, useState } from "react";
import { updateAccountAction } from "@/app/(shell)/finances/actions";
import type { AccountEdit } from "@/lib/finances/mutations";
import {
  Drawer,
  DrawerFooter,
  DrawerHeader,
  DrawerLeaveGuard,
} from "@/components/detail/Drawer";
import { useDrawerForm } from "@/components/detail/useDrawerForm";
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
  summary,
}: {
  account: FinanceAccountRow | null;
  onClose: () => void;
  onChanged: () => void;
  summary?: ReactNode;
}) {
  const titleId = useId();

  if (!account) return null;

  return (
    <AccountForm
      key={account.id}
      account={account}
      summary={summary}
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
  summary,
}: {
  account: FinanceAccountRow;
  titleId: string;
  onClose: () => void;
  onChanged: () => void;
  summary?: ReactNode;
}) {
  const today = useToday();
  const [savedClosed, setSavedClosed] = useState(account.closedAt !== null);
  const { draft, patch, dirty, footer } = useDrawerForm({
    initial: () => draftOf(account),
    persist: async (next) => {
      const edit: AccountEdit = {
        name: next.name,
        kind: next.kind,
        institution: next.institution,
        url: next.url,
        offBudget: next.offBudget,
      };
      if (next.closed !== savedClosed) {
        if (next.closed && today === null) {
          return { ok: false, error: "Could not read today's date." };
        }
        edit.closedOn = next.closed ? today : null;
      }
      const result = await updateAccountAction(account.id, edit);
      if (result.ok) setSavedClosed(next.closed);
      return result;
    },
    onChanged,
    onClose,
  });

  return (
    <Drawer open onClose={onClose} labelledBy={titleId}>
      <DrawerHeader
        titleId={titleId}
        eyebrow="Account"
        title={draft.name || account.name}
        onClose={onClose}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {summary}
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
                  patch("kind", value);
                  if (isCoreBudgetKind(value)) patch("offBudget", false);
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
              hint="Closed accounts stay in the register and remain in All accounts."
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
              {account.transactionCount} transaction
              {account.transactionCount === 1 ? "" : "s"}
            </p>
            <p className="text-[0.75rem] text-ink-faint">
              Importers match on the last four and the feed, never the name. Changing
              those here would fork the account on the next import.
            </p>
          </Section>
        </div>
      </div>
      <DrawerLeaveGuard dirty={dirty} />
      <DrawerFooter {...footer} />
    </Drawer>
  );
}
