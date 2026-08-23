"use client";

import { useId, useState, useTransition } from "react";
import { saveRuleAction } from "@/app/finances/actions";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import { Drawer, DrawerFooter, DrawerHeader } from "@/components/detail/Drawer";
import { Section, TextArea } from "@/components/detail/fields";
import { PayeePickerField } from "@/components/finances/payees/PayeePickerField";
import { FINANCE_CATEGORIES } from "@/lib/finances/classify/categories";
import {
  blankCondition,
  draftActions,
  draftConditions,
  storedActions,
  storedConditions,
  type RuleDraft,
  type RuleDraftAction,
  type RuleDraftCondition,
} from "@/lib/finances/rules/editorDraft";
import type { RuleRow } from "@/lib/finances/rules/queries";

/**
 * The editor for one rule.
 *
 * **`merchant` and `description` are offered as two separate fields, labelled for what they
 * actually test.** Every anchored pattern in the starter set is written against the cleaned
 * merchant — `^GITHUB` claims `PAYPAL *GITHUB INC` only after the processor stamp is stripped —
 * and the same pattern against the raw bank line silently claims nothing. One field with a
 * "raw" toggle would hide that at exactly the moment someone is writing a pattern.
 */

const MERCHANT_OPS = ["matches", "is", "contains", "oneOf"] as const;
const DESCRIPTION_OPS = ["matches", "contains", "is"] as const;
const ID_OPS = ["is", "oneOf"] as const;
const AMOUNT_OPS = ["is", "isapprox", "isbetween", "gt", "gte", "lt", "lte"] as const;
const DATE_OPS = ["is", "isbetween", "gt", "gte", "lt", "lte"] as const;

const FIELD_OPTIONS = [
  { value: "merchant", label: "Merchant (cleaned)" },
  { value: "description", label: "Bank description (raw)" },
  { value: "payee", label: "Payee" },
  { value: "account", label: "Account" },
  { value: "amount", label: "Amount" },
  { value: "date", label: "Date" },
] as const;

const FLOW_OPTIONS = [
  "spend",
  "income",
  "refund",
  "interest_fee",
  "internal_transfer",
  "external_transfer",
] as const;

function opsFor(field: string): readonly string[] {
  if (field === "merchant") return MERCHANT_OPS;
  if (field === "description") return DESCRIPTION_OPS;
  if (field === "payee" || field === "account") return ID_OPS;
  if (field === "amount") return AMOUNT_OPS;
  return DATE_OPS;
}

export function RuleDrawer({
  rule,
  initialDraft,
  payees,
  accounts,
  open,
  onClose,
  onSaved,
}: {
  /** Null means a new rule. */
  rule: RuleRow | null;
  initialDraft?: RuleDraft;
  payees: readonly { id: string; name: string }[];
  accounts: readonly { id: string; name: string }[];
  open: boolean;
  onClose: () => void;
  onSaved: (id?: string) => void;
}) {
  const titleId = useId();
  if (!open) return null;
  return (
    <RuleForm
      key={rule?.id ?? initialDraft?.name ?? "new"}
      rule={rule}
      initialDraft={initialDraft}
      payees={payees}
      accounts={accounts}
      titleId={titleId}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function RuleForm({
  rule,
  initialDraft,
  payees,
  accounts,
  titleId,
  onClose,
  onSaved,
}: {
  rule: RuleRow | null;
  initialDraft?: RuleDraft;
  payees: readonly { id: string; name: string }[];
  accounts: readonly { id: string; name: string }[];
  titleId: string;
  onClose: () => void;
  onSaved: (id?: string) => void;
}) {
  const nameId = useId();
  const [savedRuleId, setSavedRuleId] = useState(rule?.id ?? null);
  const [name, setName] = useState(rule?.name ?? initialDraft?.name ?? "");
  const [notes, setNotes] = useState(rule?.notes ?? initialDraft?.notes ?? "");
  const [enabled, setEnabled] = useState(
    rule?.enabled ?? initialDraft?.enabled ?? true,
  );
  const [conditions, setConditions] = useState<RuleDraftCondition[]>(
    initialDraft?.conditions ?? draftConditions(rule?.conditions),
  );
  const [actions, setActions] = useState<RuleDraftAction[]>(
    initialDraft?.actions ?? draftActions(rule?.actions),
  );
  const [dirty, setDirty] = useState(rule === null);
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [saving, startTransition] = useTransition();

  function touch() {
    setDirty(true);
  }

  function requestClose() {
    if (dirty) setConfirmClose(true);
    else onClose();
  }

  function patchCondition(index: number, patch: Partial<RuleDraftCondition>) {
    setConditions((current) =>
      current.map((entry, at) => {
        if (at !== index) return entry;
        const next = { ...entry, ...patch };
        // Changing the field can strand an op that field does not offer.
        if (patch.field && !opsFor(patch.field).includes(next.op)) {
          next.op = opsFor(patch.field)[0];
        }
        return next;
      }),
    );
    touch();
  }

  function save(thenClose: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await saveRuleAction(savedRuleId, {
        name,
        conditions: storedConditions(conditions),
        actions: storedActions(actions),
        enabled,
        notes,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.id) setSavedRuleId(result.id);
      setDirty(false);
      onSaved(result.id);
      if (thenClose) onClose();
    });
  }

  return (
    <>
      <Drawer open onClose={requestClose} labelledBy={titleId}>
        <DrawerHeader
          titleId={titleId}
          eyebrow="Rule"
          title={rule ? rule.name : "New rule"}
          onClose={requestClose}
        />

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-7">
            <Section title="Rule">
              <label
                htmlFor={nameId}
                className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted"
              >
                Name
                <input
                  id={nameId}
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    touch();
                  }}
                  className="min-h-tap rounded border border-rule bg-surface px-2 py-1.5 text-base font-normal normal-case tracking-normal text-ink outline-none focus:border-select-edge md:min-h-0 md:text-[0.8125rem]"
                />
              </label>
              <label className="flex items-center gap-2 text-[0.8125rem] text-ink">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) => {
                    setEnabled(event.target.checked);
                    touch();
                  }}
                />
                On
              </label>
            </Section>

            <Section title="When every one of these is true">
              {conditions.map((condition, index) => (
                <div
                  key={index}
                  className="flex flex-col items-stretch gap-2 md:flex-row md:flex-wrap md:items-center"
                >
                  <select
                    aria-label="Field"
                    value={condition.field}
                    onChange={(event) =>
                      patchCondition(index, { field: event.target.value })
                    }
                    className="min-h-tap w-full rounded border border-rule bg-surface px-2 py-1 text-[0.8125rem] text-ink md:min-h-0 md:w-auto"
                  >
                    {FIELD_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Comparison"
                    value={condition.op}
                    onChange={(event) =>
                      patchCondition(index, { op: event.target.value })
                    }
                    className="min-h-tap w-full rounded border border-rule bg-surface px-2 py-1 text-[0.8125rem] text-ink md:min-h-0 md:w-auto"
                  >
                    {opsFor(condition.field).map((op) => (
                      <option key={op} value={op}>
                        {op}
                      </option>
                    ))}
                  </select>
                  {condition.field === "payee" ? (
                    <div className="basis-full rounded border border-rule bg-surface-raised p-2">
                      <PayeePickerField
                        label={condition.op === "is" ? "Payee" : "Any payee"}
                        payees={payees}
                        value={condition.value
                          .split(",")
                          .map((value) => value.trim())
                          .filter(Boolean)}
                        onChange={(ids) =>
                          patchCondition(index, {
                            value: (condition.op === "is" ? ids.slice(-1) : ids).join(
                              ", ",
                            ),
                          })
                        }
                      />
                    </div>
                  ) : condition.field === "account" ? (
                    <div className="basis-full rounded border border-rule bg-surface-raised p-2">
                      <p className="mb-1.5 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
                        {condition.op === "is" ? "Account" : "Any account"}
                      </p>
                      <div className="grid gap-1 sm:grid-cols-2">
                        {accounts.map((account) => {
                          const selected = condition.value
                            .split(",")
                            .map((value) => value.trim())
                            .filter(Boolean);
                          const checked = selected.includes(account.id);
                          return (
                            <label
                              key={account.id}
                              className="flex min-h-tap items-center gap-2 text-[0.8125rem] text-ink md:min-h-0"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  const ids = checked
                                    ? selected.filter((id) => id !== account.id)
                                    : condition.op === "is"
                                      ? [account.id]
                                      : [...selected, account.id];
                                  patchCondition(index, { value: ids.join(", ") });
                                }}
                              />
                              {account.name}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <>
                      <input
                        aria-label="Value"
                        value={condition.value}
                        placeholder={
                          condition.field === "amount"
                            ? "-50.00"
                            : condition.field === "date"
                              ? "2026-01-31"
                              : condition.op === "oneOf"
                                ? "one, two"
                                : ""
                        }
                        onChange={(event) =>
                          patchCondition(index, { value: event.target.value })
                        }
                        className="min-h-tap min-w-0 w-full rounded border border-rule bg-surface px-2 py-1 text-base text-ink outline-none focus:border-select-edge md:min-h-0 md:flex-1 md:text-[0.8125rem]"
                      />
                      {condition.op === "isbetween" ? (
                        <input
                          aria-label="Upper value"
                          value={condition.upperValue}
                          placeholder={
                            condition.field === "amount" ? "-10.00" : "2026-12-31"
                          }
                          onChange={(event) =>
                            patchCondition(index, { upperValue: event.target.value })
                          }
                          className="min-h-tap min-w-0 w-full rounded border border-rule bg-surface px-2 py-1 text-base text-ink outline-none focus:border-select-edge md:min-h-0 md:flex-1 md:text-[0.8125rem]"
                        />
                      ) : null}
                      {condition.op === "matches" ? (
                        <select
                          aria-label="Pattern flags"
                          value={condition.flags}
                          onChange={(event) =>
                            patchCondition(index, { flags: event.target.value })
                          }
                          className="min-h-tap w-full rounded border border-rule bg-surface px-2 py-1 text-[0.8125rem] text-ink md:min-h-0 md:w-auto"
                        >
                          <option value="">Case-sensitive</option>
                          <option value="i">Ignore case</option>
                        </select>
                      ) : null}
                    </>
                  )}
                  <button
                    type="button"
                    className="min-h-tap shrink-0 px-2 text-[0.8125rem] text-ink-muted hover:text-ink md:min-h-0"
                    onClick={() => {
                      setConditions((current) =>
                        current.filter((_, at) => at !== index),
                      );
                      touch();
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="min-h-tap self-start rounded border border-rule px-3 py-1.5 text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0"
                onClick={() => {
                  setConditions((current) => [...current, blankCondition()]);
                  touch();
                }}
              >
                Add condition
              </button>
              <p className="text-[0.75rem] text-ink-muted">
                Amounts are what the register shows: a $50 charge is −50.
              </p>
            </Section>

            <Section title="Then">
              {actions.map((action, index) => (
                <div
                  key={index}
                  className="flex flex-col items-stretch gap-2 md:flex-row md:flex-wrap md:items-center"
                >
                  <select
                    aria-label="Action"
                    value={action.kind}
                    onChange={(event) => {
                      const kind = event.target.value as RuleDraftAction["kind"];
                      setActions((current) =>
                        current.map((entry, at) =>
                          at === index ? { kind, value: "" } : entry,
                        ),
                      );
                      touch();
                    }}
                    className="min-h-tap w-full rounded border border-rule bg-surface px-2 py-1 text-[0.8125rem] text-ink md:min-h-0 md:w-auto"
                  >
                    <option value="category">Set category</option>
                    <option value="flow">Set flow</option>
                    <option value="name-payee">Name a new payee</option>
                  </select>
                  {action.kind === "name-payee" ? (
                    <input
                      aria-label="Payee name"
                      value={action.value}
                      onChange={(event) => {
                        const value = event.target.value;
                        setActions((current) =>
                          current.map((entry, at) =>
                            at === index ? { ...entry, value } : entry,
                          ),
                        );
                        touch();
                      }}
                      className="min-h-tap min-w-0 w-full rounded border border-rule bg-surface px-2 py-1 text-base text-ink outline-none focus:border-select-edge md:min-h-0 md:flex-1 md:text-[0.8125rem]"
                    />
                  ) : (
                    <select
                      aria-label="Value"
                      value={action.value}
                      onChange={(event) => {
                        const value = event.target.value;
                        setActions((current) =>
                          current.map((entry, at) =>
                            at === index ? { ...entry, value } : entry,
                          ),
                        );
                        touch();
                      }}
                      className="min-h-tap min-w-0 w-full rounded border border-rule bg-surface px-2 py-1 text-[0.8125rem] text-ink md:min-h-0 md:flex-1"
                    >
                      <option value="">Choose…</option>
                      {(action.kind === "category"
                        ? FINANCE_CATEGORIES
                        : FLOW_OPTIONS
                      ).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    className="min-h-tap shrink-0 px-2 text-[0.8125rem] text-ink-muted hover:text-ink md:min-h-0"
                    onClick={() => {
                      setActions((current) => current.filter((_, at) => at !== index));
                      touch();
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="min-h-tap self-start rounded border border-rule px-3 py-1.5 text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0"
                onClick={() => {
                  setActions((current) => [
                    ...current,
                    { kind: "category", value: "" },
                  ]);
                  touch();
                }}
              >
                Add action
              </button>
              <p className="text-[0.75rem] text-ink-muted">
                Naming a payee applies only to a merchant seen for the first time. It
                never renames one that already exists.
              </p>
            </Section>

            <Section title="Why">
              <TextArea
                label="Notes"
                value={notes}
                onChange={(value) => {
                  setNotes(value);
                  touch();
                }}
                placeholder="Rules run top to bottom and the first match wins. Say why this one sits where it does."
              />
            </Section>
          </div>
        </div>

        <DrawerFooter
          onClose={requestClose}
          onSave={() => save(false)}
          onSaveAndClose={() => save(true)}
          saving={saving}
          dirty={dirty}
          error={error}
        />
      </Drawer>

      <ConfirmDialog
        open={confirmClose}
        title="Discard changes?"
        message="This rule has unsaved changes."
        confirmLabel="Discard"
        destructive
        onConfirm={() => {
          setConfirmClose(false);
          onClose();
        }}
        onCancel={() => setConfirmClose(false)}
      />
    </>
  );
}
