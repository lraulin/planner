"use client";

import { useCallback, useEffect, useId, useMemo, useState, useTransition } from "react";
import type { ContactItemKind } from "@/db/schema";
import type { ContactDetail, ContactInput } from "@/lib/contacts/types";
import type { ContactItemField } from "@/lib/contacts/itemKinds";
import { formalNameOf, formatBirthday } from "@/lib/contacts/name";
import {
  createContactItemAction,
  deleteContactItemAction,
  getContactDetailAction,
  moveContactItemAction,
  setPrimaryContactItemAction,
  updateContactAction,
  updateContactItemAction,
} from "@/app/library/contacts/actions";
import { Drawer, DrawerFooter, DrawerHeader } from "@/components/detail/Drawer";
import { FormTabs } from "@/components/detail/FormTabs";
import {
  ContextsField,
  DraftTextArea,
  DraftTextField,
  FieldGrid,
  Section,
} from "@/components/detail/fields";
import { LinkedNotesPanel } from "@/components/notes/LinkedNotesPanel";
import { ContactItemList } from "./ContactItemList";
import { ContactDiscussionPanel } from "./ContactDiscussionPanel";

type TabId = "general" | "address" | "discussion" | "history";

/**
 * The Contact Information form — Achieve's four tabs, minus the Details grid.
 *
 * **Scalars are a local draft written on Save; repeating rows write straight through.** The
 * same split `NodeDetailDrawer` makes, and for the same reason: a name is edited as a whole
 * and a phone number is a record of its own. Fields commit on blur rather than per keystroke
 * because the house `run()` wrapper revalidates the entire layout after every action.
 */
export function ContactDrawer({
  contactId,
  onClose,
  onChanged,
}: {
  /** Which contact is open, straight from `?detail=`. Null means closed. */
  contactId: string | null;
  onClose: () => void;
  /** Something changed that the list behind the drawer should re-read. */
  onChanged: () => void;
}) {
  const titleId = useId();
  const [tab, setTab] = useState<TabId>("general");
  const [draft, setDraft] = useState<ContactInput>({});
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [saving, startSaving] = useTransition();
  const [busy, startBusy] = useTransition();

  /**
   * The fetch result carries the id it was fetched for, so a result for the previously
   * opened contact reads as "not loaded yet" rather than being cleared by an effect — the
   * same shape `NodeDetailDrawer` uses, and the reason a fast second open cannot show the
   * first contact's record under the second one's title.
   */
  const [loaded, setLoaded] = useState<{
    contactId: string;
    detail: ContactDetail | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!contactId) return;

    let current = true;
    void getContactDetailAction(contactId).then(
      (result) => {
        if (!current) return;
        if (!result.ok) setLoaded({ contactId, detail: null, error: result.error });
        else if (!result.data)
          setLoaded({
            contactId,
            detail: null,
            error: "That contact no longer exists.",
          });
        else setLoaded({ contactId, detail: result.data, error: null });
      },
      // A rejected action would otherwise leave the drawer on its loading state forever.
      () => {
        if (current) {
          setLoaded({ contactId, detail: null, error: "Could not load this contact." });
        }
      },
    );

    return () => {
      current = false;
    };
  }, [contactId]);

  // A new record is a new form. Without this the draft from the last contact would bleed
  // into the next one and save their name onto someone else. Adjusted during render rather
  // than in an effect, so the wrong contact's draft is never shown even for one pass.
  const [seenId, setSeenId] = useState(contactId);
  if (contactId !== seenId) {
    setSeenId(contactId);
    setDraft({});
    setError(null);
    setJustSaved(false);
    setTab("general");
  }

  const detail = loaded?.contactId === contactId ? loaded.detail : null;
  const loadError = loaded?.contactId === contactId ? loaded.error : null;
  const dirty = Object.keys(draft).length > 0;

  const field = useCallback(
    <K extends keyof ContactInput>(key: K): NonNullable<ContactInput[K]> =>
      (draft[key] ?? detail?.[key as keyof ContactDetail]) as NonNullable<
        ContactInput[K]
      >,
    [draft, detail],
  );

  const set = useCallback(
    <K extends keyof ContactInput>(key: K, value: ContactInput[K]) => {
      setJustSaved(false);
      setDraft((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const reload = useCallback(async (): Promise<void> => {
    if (!contactId) return;
    const result = await getContactDetailAction(contactId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setLoaded({ contactId, detail: result.data, error: null });
    onChanged();
  }, [contactId, onChanged]);

  const save = useCallback(
    (thenClose: boolean) => {
      if (!detail) return;
      setError(null);
      startSaving(async () => {
        if (dirty) {
          const result = await updateContactAction(detail.id, draft);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setDraft({});
        }
        await reload();
        if (thenClose) onClose();
        else setJustSaved(true);
      });
    },
    [detail, dirty, draft, reload, onClose],
  );

  /** Repeating-row writes: apply, then reload so the drawer shows what the database has. */
  const apply = useCallback(
    (
      action: () => Promise<{ ok: true; id?: string } | { ok: false; error: string }>,
    ) => {
      setError(null);
      startBusy(async () => {
        const result = await action();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        await reload();
      });
    },
    [reload],
  );

  const itemsOf = useMemo(() => {
    const map = new Map<ContactItemKind, ContactDetail["items"]>();
    for (const item of detail?.items ?? []) {
      const list = map.get(item.kind);
      if (list) list.push(item);
      else map.set(item.kind, [item]);
    }
    return map;
  }, [detail?.items]);

  const listProps = (kind: ContactItemKind) => ({
    kind,
    items: itemsOf.get(kind) ?? [],
    busy,
    onCreate: () => detail && apply(() => createContactItemAction(detail.id, kind)),
    onUpdate: (itemId: string, key: ContactItemField, value: string) =>
      apply(() => updateContactItemAction(itemId, { [key]: value })),
    onDelete: (itemId: string) => apply(() => deleteContactItemAction(itemId)),
    onMove: (itemId: string, direction: "up" | "down") =>
      apply(() => moveContactItemAction(itemId, direction)),
    onSetPrimary: (itemId: string) => apply(() => setPrimaryContactItemAction(itemId)),
  });

  if (!contactId) return null;

  if (!detail) {
    return (
      <Drawer open onClose={onClose} labelledBy={titleId}>
        <DrawerHeader
          titleId={titleId}
          title={loadError ? "Could not open" : "Loading…"}
          onClose={onClose}
        />
        {loadError && (
          <p role="alert" className="px-5 py-4 text-[0.875rem] text-priority-a">
            {loadError}
          </p>
        )}
      </Drawer>
    );
  }

  const birthday = formatBirthday(
    field("birthdayYear"),
    field("birthdayMonth"),
    field("birthdayDay"),
  );

  const tabs = [
    {
      id: "general" as const,
      label: "General",
      render: () => (
        <div className="flex flex-col gap-5">
          <Section title="Name">
            <FieldGrid columns={3}>
              <DraftTextField
                label="Title"
                value={field("namePrefix")}
                placeholder="Dr."
                onCommit={(v) => set("namePrefix", v)}
              />
              <DraftTextField
                label="First"
                value={field("givenName")}
                onCommit={(v) => set("givenName", v)}
              />
              <DraftTextField
                label="Middle"
                value={field("middleName")}
                onCommit={(v) => set("middleName", v)}
              />
              <DraftTextField
                label="Last"
                value={field("familyName")}
                onCommit={(v) => set("familyName", v)}
              />
              <DraftTextField
                label="Suffix"
                value={field("nameSuffix")}
                placeholder="Jr."
                onCommit={(v) => set("nameSuffix", v)}
              />
              <DraftTextField
                label="Nickname"
                value={field("nickname")}
                onCommit={(v) => set("nickname", v)}
              />
              <DraftTextField
                label="Initials"
                value={field("initials")}
                placeholder="derived"
                onCommit={(v) => set("initials", v)}
              />
              <DraftTextField
                label="File as"
                value={field("fileAs")}
                placeholder="derived"
                onCommit={(v) => set("fileAs", v)}
              />
            </FieldGrid>
          </Section>

          <Section title="Organization">
            <FieldGrid columns={2}>
              <DraftTextField
                label="Company"
                value={field("company")}
                onCommit={(v) => set("company", v)}
              />
              <DraftTextField
                label="Job title"
                value={field("jobTitle")}
                onCommit={(v) => set("jobTitle", v)}
              />
              <DraftTextField
                label="Department"
                value={field("department")}
                onCommit={(v) => set("department", v)}
              />
              <DraftTextField
                label="Group"
                value={field("groupName")}
                onCommit={(v) => set("groupName", v)}
              />
              <DraftTextField
                label="Manager"
                value={field("managerName")}
                onCommit={(v) => set("managerName", v)}
              />
              <DraftTextField
                label="Assistant"
                value={field("assistantName")}
                onCommit={(v) => set("assistantName", v)}
              />
            </FieldGrid>
          </Section>

          <ContactItemList {...listProps("phone")} />
          <ContactItemList {...listProps("email")} />

          <Section title="Other">
            <BirthdayField
              year={field("birthdayYear")}
              month={field("birthdayMonth")}
              day={field("birthdayDay")}
              rendered={birthday}
              onChange={(y, m, d) => {
                set("birthdayYear", y);
                set("birthdayMonth", m);
                set("birthdayDay", d);
              }}
            />
            <ContextsField
              value={field("contexts")}
              onChange={(v) => set("contexts", v)}
            />
            <DraftTextArea
              label="Notes"
              value={field("notes")}
              rows={5}
              onCommit={(v) => set("notes", v)}
            />
          </Section>
        </div>
      ),
    },
    {
      id: "address" as const,
      label: "Address",
      render: () => (
        <div className="flex flex-col gap-5">
          <ContactItemList {...listProps("address")} />
          <ContactItemList {...listProps("url")} />
        </div>
      ),
    },
    {
      id: "discussion" as const,
      label: `Discussion Items${
        detail.discussionItems.filter((i) => !i.resolved).length > 0
          ? ` (${detail.discussionItems.filter((i) => !i.resolved).length})`
          : ""
      }`,
      render: () => (
        <ContactDiscussionPanel
          contactId={detail.id}
          items={detail.discussionItems}
          busy={busy}
          onChanged={reload}
        />
      ),
    },
    {
      id: "history" as const,
      label: "History",
      // Achieve's History tab is a note with a date, which is what `LinkedNotesPanel`
      // already renders — so it serves both rather than growing a near-identical twin.
      render: () => (
        <LinkedNotesPanel
          link={{ contactId: detail.id }}
          notes={detail.history}
          title="History"
          emptyText="Nothing recorded about this person yet."
        />
      ),
    },
  ];

  return (
    <Drawer open onClose={onClose} labelledBy={titleId}>
      <DrawerHeader
        titleId={titleId}
        eyebrow="Contact"
        title={detail.displayName}
        onClose={onClose}
      />
      <div className="sr-only">{formalNameOf(detail)}</div>

      <FormTabs tabs={tabs} active={tab} onSelect={(id) => setTab(id as TabId)} />

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

/**
 * People's partial birthday — the year is optional and routinely unknown, so it is three
 * inputs rather than a date picker that would force one.
 */
function BirthdayField({
  year,
  month,
  day,
  rendered,
  onChange,
}: {
  year: number | null;
  month: number | null;
  day: number | null;
  rendered: string;
  onChange: (year: number | null, month: number | null, day: number | null) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
        Birthday
      </span>
      <div className="flex items-center gap-2">
        <NumberBox
          key={`day:${day ?? ""}`}
          label="Day"
          value={day}
          max={31}
          onChange={(v) => onChange(year, month, v)}
        />
        <NumberBox
          key={`month:${month ?? ""}`}
          label="Month"
          value={month}
          max={12}
          onChange={(v) => onChange(year, v, day)}
        />
        <NumberBox
          key={`year:${year ?? ""}`}
          label="Year"
          value={year}
          max={9999}
          width="w-20"
          onChange={(v) => onChange(v, month, day)}
        />
        <span className="text-[0.75rem] text-ink-faint">{rendered || "—"}</span>
      </div>
      <p className="text-[0.75rem] text-ink-faint">
        Day and month go together; the year is optional.
      </p>
    </div>
  );
}

function NumberBox({
  label,
  value,
  max,
  width = "w-14",
  onChange,
}: {
  label: string;
  value: number | null;
  max: number;
  width?: string;
  onChange: (value: number | null) => void;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));

  // The stored value only changes from outside when a different contact loads, and the
  // call site keys on that — so no effect is needed to pull the prop back in.
  return (
    <input
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        const trimmed = text.trim();
        if (!trimmed) {
          if (value !== null) onChange(null);
          return;
        }
        const parsed = Number.parseInt(trimmed, 10);
        if (Number.isNaN(parsed)) {
          setText(value === null ? "" : String(value));
          return;
        }
        const clamped = Math.min(max, Math.max(1, parsed));
        setText(String(clamped));
        if (clamped !== value) onChange(clamped);
      }}
      aria-label={label}
      placeholder={label}
      inputMode="numeric"
      className={`${width} min-h-tap rounded border border-rule bg-surface px-2 py-1 text-center text-[0.8125rem] text-ink outline-none focus:border-rule-strong md:min-h-0`}
    />
  );
}
