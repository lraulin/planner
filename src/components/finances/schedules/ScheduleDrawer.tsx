"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { createScheduleAction, updateScheduleAction } from "@/app/finances/actions";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import { Drawer, DrawerFooter, DrawerHeader } from "@/components/detail/Drawer";
import {
  CheckboxField,
  FieldGrid,
  Section,
  SelectField,
  TextField,
} from "@/components/detail/fields";
import { DateText } from "@/components/date/DateText";
import { PayeePickerField } from "@/components/finances/payees/PayeePickerField";
import { useToday } from "@/components/grid/useToday";
import type { FinanceAccountRow } from "@/lib/finances/types";
import {
  dateConfigOf,
  extractScheduleConds,
  type AmountCondition,
  type ScheduleCondition,
} from "@/lib/finances/schedules/conditions";
import {
  occurrences,
  type RecurConfig,
  type RecurPattern,
} from "@/lib/finances/schedules/recur";
import type { ScheduleRecord } from "@/lib/finances/schedules/queries";
import {
  UPCOMING_LENGTH_LABELS,
  UPCOMING_LENGTH_PRESETS,
} from "@/lib/finances/schedules/status";

export const NEW_SCHEDULE_ID = "new";

const WEEKDAYS: RecurPattern["type"][] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

type Draft = {
  name: string;
  accountId: string | null;
  payeeIds: string[];
  amountOp: AmountCondition["op"];
  amount: string;
  amountHi: string;
  frequency: RecurConfig["frequency"];
  interval: string;
  monthDay: string;
  weekday: RecurPattern["type"] | "";
  weekdayNth: string;
  skipWeekend: boolean;
  weekendSolveMode: "before" | "after";
  endMode: NonNullable<RecurConfig["endMode"]>;
  endOccurrences: string;
  endDate: string;
  postsTransaction: boolean;
  customUpcomingLength: string | null;
};

function dollarsFromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function centsFromDollars(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

function draftOf(record: ScheduleRecord | null, today: string): Draft {
  if (!record) {
    return {
      name: "",
      accountId: null,
      payeeIds: [],
      amountOp: "isapprox",
      amount: "",
      amountHi: "",
      frequency: "monthly",
      interval: "1",
      monthDay: "",
      weekday: "",
      weekdayNth: "2",
      skipWeekend: false,
      weekendSolveMode: "after",
      endMode: "never",
      endOccurrences: "12",
      endDate: today,
      postsTransaction: false,
      customUpcomingLength: null,
    };
  }
  const conds = extractScheduleConds(record.conditions);
  const config = dateConfigOf(conds.date);
  const dayPattern = config?.patterns?.find((p) => p.type === "day");
  const weekdayPattern = config?.patterns?.find((p) => p.type !== "day");
  return {
    name: record.name,
    accountId: conds.account?.value ?? null,
    payeeIds: conds.payee
      ? conds.payee.op === "is"
        ? [conds.payee.value]
        : conds.payee.value
      : [],
    amountOp: conds.amount?.op ?? "isapprox",
    amount:
      conds.amount && conds.amount.op !== "isbetween"
        ? dollarsFromCents(conds.amount.value)
        : conds.amount?.op === "isbetween"
          ? dollarsFromCents(conds.amount.value.num1)
          : "",
    amountHi:
      conds.amount?.op === "isbetween" ? dollarsFromCents(conds.amount.value.num2) : "",
    frequency: config?.frequency ?? "monthly",
    interval: String(config?.interval ?? 1),
    monthDay: dayPattern ? String(dayPattern.value) : "",
    weekday: weekdayPattern && weekdayPattern.type !== "day" ? weekdayPattern.type : "",
    weekdayNth: weekdayPattern ? String(weekdayPattern.value) : "2",
    skipWeekend: config?.skipWeekend === true,
    weekendSolveMode: config?.weekendSolveMode ?? "after",
    endMode: config?.endMode ?? "never",
    endOccurrences: String(config?.endOccurrences ?? 12),
    endDate: config?.endDate ?? today,
    postsTransaction: record.postsTransaction,
    customUpcomingLength: record.customUpcomingLength,
  };
}

function buildConditions(draft: Draft, start: string): ScheduleCondition[] | string {
  const interval = Number(draft.interval);
  if (!Number.isInteger(interval) || interval < 1) {
    return "Interval must be a whole number of 1 or more.";
  }
  const config: RecurConfig = {
    frequency: draft.frequency,
    interval,
    start,
    skipWeekend: draft.skipWeekend || undefined,
    weekendSolveMode: draft.skipWeekend ? draft.weekendSolveMode : undefined,
    endMode: draft.endMode !== "never" ? draft.endMode : undefined,
  };
  const patterns: RecurPattern[] = [];
  if (draft.frequency === "monthly" && draft.monthDay.trim() !== "") {
    const day = Number(draft.monthDay);
    if (!Number.isInteger(day) || day === 0 || day < -31 || day > 31) {
      return "Day of month must be 1–31, or a negative count from the end.";
    }
    patterns.push({ type: "day", value: day });
  }
  if (draft.frequency === "monthly" && draft.weekday !== "") {
    const nth = Number(draft.weekdayNth);
    if (!Number.isInteger(nth) || nth === 0 || nth < -5 || nth > 5) {
      return "Weekday occurrence must be 1–5, or a negative count from the end.";
    }
    patterns.push({ type: draft.weekday, value: nth });
  }
  if (patterns.length > 0) config.patterns = patterns;
  if (draft.endMode === "after_n_occurrences") {
    const n = Number(draft.endOccurrences);
    if (!Number.isInteger(n) || n < 1)
      return "End after N needs a whole number of 1 or more.";
    config.endOccurrences = n;
  }
  if (draft.endMode === "on_date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.endDate))
      return "End date must be a calendar day.";
    config.endDate = draft.endDate;
  }

  const conditions: ScheduleCondition[] = [
    { field: "date", op: "isapprox", value: config },
  ];
  if (draft.payeeIds.length === 1)
    conditions.push({ field: "payee", op: "is", value: draft.payeeIds[0] });
  else if (draft.payeeIds.length > 1)
    conditions.push({ field: "payee", op: "oneOf", value: draft.payeeIds });
  if (draft.accountId)
    conditions.push({ field: "account", op: "is", value: draft.accountId });
  if (draft.amountOp === "isbetween") {
    const lo = centsFromDollars(draft.amount);
    const hi = centsFromDollars(draft.amountHi);
    if (lo == null || hi == null) return "Amount range needs two numbers.";
    conditions.push({
      field: "amount",
      op: "isbetween",
      value: { num1: lo, num2: hi },
    });
  } else if (draft.amount.trim() !== "") {
    const cents = centsFromDollars(draft.amount);
    if (cents == null) return "Amount must be a number.";
    conditions.push({ field: "amount", op: draft.amountOp, value: cents });
  }
  return conditions;
}

export function ScheduleDrawer({
  record,
  creating,
  accounts,
  payees,
  onClose,
  onChanged,
}: {
  record: ScheduleRecord | null;
  creating: boolean;
  accounts: FinanceAccountRow[];
  payees: { id: string; name: string }[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const titleId = useId();
  const today = useToday() ?? "2026-01-01";
  if (!creating && !record) return null;

  return (
    <ScheduleForm
      key={record?.id ?? NEW_SCHEDULE_ID}
      record={record}
      creating={creating}
      accounts={accounts}
      payees={payees}
      today={today}
      titleId={titleId}
      onClose={onClose}
      onChanged={onChanged}
    />
  );
}

function ScheduleForm({
  record,
  creating,
  accounts,
  payees,
  today,
  titleId,
  onClose,
  onChanged,
}: {
  record: ScheduleRecord | null;
  creating: boolean;
  accounts: FinanceAccountRow[];
  payees: { id: string; name: string }[];
  today: string;
  titleId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState(() => draftOf(record, today));
  const [dirty, setDirty] = useState(creating);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [saving, startTransition] = useTransition();
  const existingStart = record
    ? (dateConfigOf(extractScheduleConds(record.conditions).date)?.start ?? today)
    : today;

  function patch<K extends keyof Draft>(key: K, value: Draft[K]) {
    setJustSaved(false);
    setDirty(true);
    setDraft((current) => ({ ...current, [key]: value }));
  }

  const preview = useMemo(() => {
    const built = buildConditions(draft, existingStart);
    if (typeof built === "string") return [];
    const config = dateConfigOf(extractScheduleConds(built).date);
    if (!config) return [];
    return occurrences(config, today, 3);
  }, [draft, existingStart, today]);

  function requestClose() {
    if (dirty) setConfirmClose(true);
    else onClose();
  }

  function save(thenClose: boolean) {
    setError(null);
    const built = buildConditions(draft, creating ? today : existingStart);
    if (typeof built === "string") {
      setError(built);
      return;
    }
    if (draft.name.trim() === "") {
      setError("A schedule needs a name.");
      return;
    }
    startTransition(async () => {
      const result = creating
        ? await createScheduleAction(
            {
              name: draft.name,
              conditions: built,
              postsTransaction: draft.postsTransaction,
              customUpcomingLength: draft.customUpcomingLength,
            },
            today,
          )
        : await updateScheduleAction(
            record!.id,
            {
              name: draft.name,
              conditions: built,
              postsTransaction: draft.postsTransaction,
              customUpcomingLength: draft.customUpcomingLength,
            },
            today,
          );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDirty(false);
      setJustSaved(true);
      onChanged();
      if (thenClose) onClose();
    });
  }

  return (
    <>
      <Drawer open onClose={requestClose} labelledBy={titleId}>
        <DrawerHeader
          titleId={titleId}
          eyebrow="Schedule"
          title={creating ? "New schedule" : draft.name || "Schedule"}
          onClose={requestClose}
        />
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-6">
            <Section title="Schedule">
              <FieldGrid>
                <TextField
                  label="Name"
                  value={draft.name}
                  onChange={(value) => patch("name", value)}
                />
                <SelectField
                  label="Account"
                  value={draft.accountId}
                  allowEmpty
                  emptyLabel="Any account"
                  options={accounts.map((account) => ({
                    value: account.id,
                    label: account.name,
                  }))}
                  onChange={(value) => patch("accountId", value)}
                />
                <PayeePickerField
                  payees={payees}
                  value={draft.payeeIds}
                  onChange={(value) => patch("payeeIds", value)}
                />
                <SelectField
                  label="Amount match"
                  value={draft.amountOp}
                  options={[
                    { value: "is", label: "is" },
                    { value: "isapprox", label: "is approximately" },
                    { value: "isbetween", label: "is between" },
                  ]}
                  onChange={(value) => patch("amountOp", value ?? "isapprox")}
                />
                <TextField
                  label={draft.amountOp === "isbetween" ? "From" : "Amount"}
                  value={draft.amount}
                  hint="Signed dollars. Negative is money out."
                  onChange={(value) => patch("amount", value)}
                />
                {draft.amountOp === "isbetween" ? (
                  <TextField
                    label="To"
                    value={draft.amountHi}
                    onChange={(value) => patch("amountHi", value)}
                  />
                ) : null}
              </FieldGrid>
            </Section>
            <Section title="Recurrence">
              <FieldGrid>
                <SelectField
                  label="Frequency"
                  value={draft.frequency}
                  options={[
                    { value: "daily", label: "Daily" },
                    { value: "weekly", label: "Weekly" },
                    { value: "monthly", label: "Monthly" },
                    { value: "yearly", label: "Yearly" },
                  ]}
                  onChange={(value) => patch("frequency", value ?? "monthly")}
                />
                <TextField
                  label="Interval"
                  value={draft.interval}
                  hint="Every N periods. 2 monthly is every other month."
                  onChange={(value) => patch("interval", value)}
                />
                {draft.frequency === "monthly" ? (
                  <>
                    <TextField
                      label="Day of month"
                      value={draft.monthDay}
                      hint="1–31, or −1 for last day. Blank uses the start date's day."
                      onChange={(value) => patch("monthDay", value)}
                    />
                    <SelectField
                      label="Nth weekday"
                      value={draft.weekday === "" ? null : draft.weekday}
                      allowEmpty
                      emptyLabel="None"
                      options={WEEKDAYS.map((day) => ({ value: day, label: day }))}
                      onChange={(value) => patch("weekday", value ?? "")}
                    />
                    {draft.weekday !== "" ? (
                      <TextField
                        label="Which"
                        value={draft.weekdayNth}
                        hint="2 is the second; −1 is the last."
                        onChange={(value) => patch("weekdayNth", value)}
                      />
                    ) : null}
                  </>
                ) : null}
                <CheckboxField
                  label="Skip weekends"
                  checked={draft.skipWeekend}
                  onChange={(checked) => patch("skipWeekend", checked)}
                />
                {draft.skipWeekend ? (
                  <SelectField
                    label="Move weekend to"
                    value={draft.weekendSolveMode}
                    options={[
                      { value: "before", label: "Previous Friday" },
                      { value: "after", label: "Next Monday" },
                    ]}
                    onChange={(value) => patch("weekendSolveMode", value ?? "after")}
                  />
                ) : null}
                <SelectField
                  label="Ends"
                  value={draft.endMode}
                  options={[
                    { value: "never", label: "Never" },
                    { value: "after_n_occurrences", label: "After N occurrences" },
                    { value: "on_date", label: "On a date" },
                  ]}
                  onChange={(value) => patch("endMode", value ?? "never")}
                />
                {draft.endMode === "after_n_occurrences" ? (
                  <TextField
                    label="Occurrences"
                    value={draft.endOccurrences}
                    onChange={(value) => patch("endOccurrences", value)}
                  />
                ) : null}
                {draft.endMode === "on_date" ? (
                  <TextField
                    label="End date"
                    value={draft.endDate}
                    hint="YYYY-MM-DD"
                    onChange={(value) => patch("endDate", value)}
                  />
                ) : null}
                <CheckboxField
                  label="Posts a transaction"
                  checked={draft.postsTransaction}
                  hint="Stored and shown. Only Post now writes a row — nothing posts unattended."
                  onChange={(checked) => patch("postsTransaction", checked)}
                />
                <SelectField
                  label="Upcoming horizon"
                  value={draft.customUpcomingLength}
                  allowEmpty
                  emptyLabel="Use register default"
                  options={UPCOMING_LENGTH_PRESETS.map((value) => ({
                    value,
                    label: UPCOMING_LENGTH_LABELS[value],
                  }))}
                  onChange={(value) => patch("customUpcomingLength", value)}
                />
              </FieldGrid>
              <p className="mt-3 text-[0.8125rem] text-ink-muted">Next three dates</p>
              <ul className="mt-1 space-y-0.5 text-[0.8125rem] text-ink">
                {preview.length === 0 ? (
                  <li className="text-ink-muted">None — check the recurrence.</li>
                ) : (
                  preview.map((key) => (
                    <li key={key}>
                      <DateText dateKey={key} />
                    </li>
                  ))
                )}
              </ul>
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
