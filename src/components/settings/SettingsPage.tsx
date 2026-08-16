"use client";

import { useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import type { GoogleCalendarLink } from "@/db/schema";
import type { BankConnectionRow } from "@/lib/banksync/queries";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import {
  useAllSettings,
  useDisplaySettings,
} from "@/components/settings/SettingsProvider";
import {
  DATE_FORMAT_OPTIONS,
  DEFAULT_DATE_FORMAT,
  formatDateKey,
  isDateFormatId,
  type DateFormatGroup,
} from "@/lib/dateFormat";
import {
  buildPreferenceGroups,
  bulkResetScopes,
  type PreferenceGroup,
} from "@/lib/settings/management";
import { AchieveTransferPanel } from "./AchieveTransferPanel";
import { GoogleCalendarPanel } from "./GoogleCalendarPanel";
import { BankSyncPanel } from "./BankSyncPanel";
import { PayCadencePanel } from "./PayCadencePanel";
import { FinanceImportPanel } from "@/components/finances/FinanceImportPanel";
import { AmazonImportPanel } from "./AmazonImportPanel";
import { RedNotebookImportPanel } from "./RedNotebookImportPanel";
import { TomboyImportPanel } from "./TomboyImportPanel";

const SECTIONS = [
  {
    id: "general",
    label: "General",
    description: "Display defaults and everyday Planner behavior.",
  },
  {
    id: "views-layout",
    label: "Views & layout",
    description: "Inspect and restore saved presentation choices by module.",
  },
  {
    id: "connections",
    label: "Connections",
    description: "Accounts that exchange calendar and contact data with Planner.",
  },
  {
    id: "import-export",
    label: "Import & export",
    description: "Move planning and journal data into or out of this account.",
  },
  {
    id: "account",
    label: "Account",
    description: "The identity currently reading and changing this Planner.",
  },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

/** Derived from the panel's own props, so the two cannot drift apart. */
type BankLinkedRow = ComponentProps<typeof BankSyncPanel>["linked"][number];

type SettingsPageProps = {
  initialSection?: string;
  accountEmail: string;
  viaDevBypass: boolean;
  googleConfigured: boolean;
  googleLinked: boolean;
  bankConnections: BankConnectionRow[];
  bankLinked: BankLinkedRow[];
  calendars: GoogleCalendarLink[];
  contactSyncLastSyncedAt: string | null;
};

function asSectionId(value: string | undefined): SectionId {
  return SECTIONS.some((section) => section.id === value)
    ? (value as SectionId)
    : "general";
}

export function SettingsPage({
  initialSection,
  accountEmail,
  viaDevBypass,
  googleConfigured,
  googleLinked,
  bankConnections,
  bankLinked,
  calendars,
  contactSyncLastSyncedAt,
}: SettingsPageProps) {
  const [sectionId, setSectionId] = useState<SectionId>(() =>
    asSectionId(initialSection),
  );
  const scrollerRef = useRef<HTMLElement>(null);
  const { saveError } = useAllSettings();
  const section = SECTIONS.find((entry) => entry.id === sectionId) ?? SECTIONS[0];

  function chooseSection(next: SectionId) {
    setSectionId(next);
    scrollerRef.current?.scrollTo({ top: 0 });
    const url = new URL(window.location.href);
    url.searchParams.set("section", next);
    window.history.replaceState(window.history.state, "", url);
  }

  return (
    <div className="flex min-h-0 flex-1 bg-surface md:grid md:grid-cols-[13.5rem_minmax(0,1fr)]">
      <aside className="hidden min-h-0 flex-col border-r border-rule bg-shell md:flex">
        <div className="border-b border-rule px-5 py-4 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          Settings index
        </div>
        <nav
          className="min-h-0 flex-1 overflow-y-auto py-2"
          aria-label="Settings categories"
        >
          {SECTIONS.map((entry) => {
            const active = entry.id === sectionId;
            return (
              <button
                key={entry.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => chooseSection(entry.id)}
                className={`relative flex min-h-10 w-full items-center px-5 text-left text-[0.8125rem] transition-colors ${
                  active
                    ? "bg-select font-semibold text-ink after:absolute after:inset-y-0 after:right-0 after:w-0.5 after:bg-select-edge"
                    : "text-ink-muted hover:bg-surface-raised hover:text-ink"
                }`}
              >
                {entry.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <main
        ref={scrollerRef}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto pb-safe"
      >
        <div className="mx-auto w-full max-w-3xl px-4 py-4 md:px-8 md:py-7">
          <label className="mb-5 block md:hidden">
            <span className="sr-only">Settings category</span>
            <select
              value={sectionId}
              onChange={(event) => chooseSection(asSectionId(event.target.value))}
              className="h-tap w-full rounded border border-rule-strong bg-surface px-3 text-ink outline-none focus:border-select-edge"
            >
              {SECTIONS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>

          <header className="mb-6 border-b border-rule pb-4">
            <p className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-select-edge">
              {section.label}
            </p>
            <h1 className="mt-1 text-[1.125rem] font-semibold tracking-tight text-ink">
              {section.label}
            </h1>
            <p className="mt-1 max-w-2xl text-[0.875rem] leading-relaxed text-ink-muted">
              {section.description}
            </p>
          </header>

          {saveError && (
            <p
              role="alert"
              className="mb-5 border border-priority-a/40 bg-priority-a/10 px-3 py-2 text-[0.8125rem] text-priority-a"
            >
              {saveError}
            </p>
          )}

          {sectionId === "general" && <GeneralPanel />}
          {sectionId === "views-layout" && <ViewsLayoutPanel />}
          {sectionId === "connections" && (
            <div className="[&_button]:min-h-tap [&_label]:min-h-tap md:[&_button]:min-h-0 md:[&_label]:min-h-0">
              <GoogleCalendarPanel
                configured={googleConfigured}
                linked={googleLinked}
                calendars={calendars}
                contactSyncLastSyncedAt={contactSyncLastSyncedAt}
              />
              <BankSyncPanel connections={bankConnections} linked={bankLinked} />
              <PayCadencePanel />
            </div>
          )}
          {sectionId === "import-export" && <TransferPanels />}
          {sectionId === "account" && (
            <AccountPanel email={accountEmail} viaDevBypass={viaDevBypass} />
          )}
        </div>
      </main>
    </div>
  );
}

function PanelHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="border-b border-rule bg-surface-raised px-4 py-2.5">
      <h2 className="text-[0.75rem] font-semibold uppercase tracking-wider text-ink-muted">
        {title}
      </h2>
      {children}
    </div>
  );
}

function GeneralPanel() {
  const { value, update, reset } = useDisplaySettings();
  const groups: DateFormatGroup[] = ["Numeric", "Written", "Partial"];
  const sampleKey = "2026-01-05";

  return (
    <section className="border border-rule bg-surface">
      <PanelHeading title="Date format" />
      <div className="grid gap-5 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,0.65fr)]">
        <div>
          <label className="block text-[0.8125rem] font-medium text-ink">
            Standalone dates
            <select
              value={value.dateFormat}
              onChange={(event) => {
                if (isDateFormatId(event.target.value)) {
                  update({ dateFormat: event.target.value });
                }
              }}
              className="mt-2 h-tap w-full rounded border border-rule-strong bg-surface px-3 font-mono text-ink outline-none focus:border-select-edge md:h-9"
            >
              {groups.map((group) => (
                <optgroup key={group} label={group}>
                  {DATE_FORMAT_OPTIONS.filter((option) => option.group === group).map(
                    (option) => (
                      <option key={option.id} value={option.id}>
                        {option.id} — {formatDateKey(sampleKey, option.id)}
                      </option>
                    ),
                  )}
                </optgroup>
              ))}
            </select>
          </label>
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-muted">
            Applies to exact calendar-day values throughout Planner. Date fields still
            store and edit canonical YYYY-MM-DD values.
          </p>
        </div>

        <div className="border-l-2 border-select-edge bg-select/45 px-4 py-3">
          <p className="font-mono text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Sample · 2026-01-05
          </p>
          <p
            className="mt-2 truncate font-mono text-[1rem] text-ink"
            title="Monday, January 5, 2026"
          >
            {formatDateKey(sampleKey, value.dateFormat)}
          </p>
        </div>

        <div className="sm:col-span-2 sm:flex sm:items-center sm:justify-between sm:gap-4">
          <p className="text-[0.75rem] text-ink-faint">
            Achieve default: <span className="font-mono">{DEFAULT_DATE_FORMAT}</span>
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-3 min-h-tap w-full rounded border border-rule px-3 py-1.5 text-[0.8125rem] text-ink transition-colors hover:border-rule-strong hover:bg-surface-raised sm:mt-0 sm:w-auto md:min-h-0"
          >
            Restore Achieve default
          </button>
        </div>
      </div>
    </section>
  );
}

type PendingReset = { title: string; message: string; label: string; scopes: string[] };

function ViewsLayoutPanel() {
  const { snapshot, resetScope, resetScopes } = useAllSettings();
  const groups = useMemo(() => buildPreferenceGroups(snapshot), [snapshot]);
  const allScopes = useMemo(() => bulkResetScopes(snapshot), [snapshot]);
  const [pendingReset, setPendingReset] = useState<PendingReset | null>(null);

  return (
    <>
      <section className="border border-rule bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule bg-surface-raised px-4 py-2.5">
          <div>
            <h2 className="text-[0.75rem] font-semibold uppercase tracking-wider text-ink-muted">
              Saved preferences
            </h2>
            <p className="mt-0.5 text-[0.75rem] text-ink-faint">
              Named views and their own settings are protected from bulk resets.
            </p>
          </div>
          <button
            type="button"
            disabled={allScopes.length === 0}
            onClick={() =>
              setPendingReset({
                title: "Reset all ordinary preferences?",
                message:
                  "Display, navigation, grid layouts, filters, sorting, grouping, and module options return to defaults. Named views and the settings stored inside them remain.",
                label: "Reset all preferences",
                scopes: allScopes,
              })
            }
            className="min-h-tap rounded border border-priority-a/50 bg-priority-a/10 px-3 py-1.5 text-[0.8125rem] font-medium text-priority-a transition-colors hover:bg-priority-a/20 disabled:cursor-not-allowed disabled:opacity-40 md:min-h-0"
          >
            Reset all preferences
          </button>
        </div>

        {groups.length === 0 ? (
          <p className="px-4 py-10 text-center text-[0.875rem] text-ink-faint">
            No view or layout preferences are stored yet.
          </p>
        ) : (
          <div className="divide-y divide-rule">
            {groups.map((group) => (
              <PreferenceGroupRows
                key={group.id}
                group={group}
                onResetScope={resetScope}
                onResetGroup={() =>
                  setPendingReset({
                    title: `Reset ${group.label}?`,
                    message: `Ordinary ${group.label} layout and display choices return to defaults. Named saved views and their own settings remain.`,
                    label: `Reset ${group.label}`,
                    scopes: group.resetScopes,
                  })
                }
              />
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={pendingReset !== null}
        title={pendingReset?.title ?? "Reset preferences?"}
        message={pendingReset?.message ?? ""}
        confirmLabel={pendingReset?.label ?? "Reset"}
        cancelLabel="Keep preferences"
        destructive
        onConfirm={() => {
          if (pendingReset) resetScopes(pendingReset.scopes);
          setPendingReset(null);
        }}
        onCancel={() => setPendingReset(null)}
      />
    </>
  );
}

function PreferenceGroupRows({
  group,
  onResetScope,
  onResetGroup,
}: {
  group: PreferenceGroup;
  onResetScope: (scope: string) => void;
  onResetGroup: () => void;
}) {
  return (
    <section>
      <div className="flex items-center justify-between gap-3 border-b border-rule/70 bg-shell px-4 py-2">
        <h3 className="text-[0.8125rem] font-semibold text-ink">{group.label}</h3>
        {group.resetScopes.length > 0 && (
          <button
            type="button"
            onClick={onResetGroup}
            className="min-h-tap rounded px-2 text-[0.75rem] text-ink-muted underline decoration-dotted underline-offset-2 hover:text-ink md:min-h-0"
          >
            Reset module
          </button>
        )}
      </div>
      <ul className="divide-y divide-rule/70">
        {group.entries.map((entry) => (
          <li
            key={entry.scope}
            className="flex items-center justify-between gap-4 px-4 py-2.5"
          >
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="truncate text-[0.8125rem] font-medium text-ink">
                  {entry.label}
                </p>
                {entry.savedView && (
                  <span className="flex-none border border-select-edge/50 bg-select px-1.5 py-0.5 font-mono text-[0.625rem] uppercase tracking-wide text-ink-muted">
                    Saved view
                  </span>
                )}
              </div>
              <p className="truncate text-[0.75rem] text-ink-faint">{entry.detail}</p>
              {entry.showScopeId && (
                <p className="truncate font-mono text-[0.6875rem] text-ink-faint">
                  {entry.scope}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onResetScope(entry.scope)}
              className="min-h-tap flex-none rounded border border-rule px-2.5 py-1 text-[0.8125rem] text-ink transition-colors hover:border-rule-strong hover:bg-surface-raised md:min-h-0"
            >
              Reset
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TransferPanels() {
  return (
    <div className="space-y-3">
      <TransferDisclosure
        title="Achieve Planner XML"
        description="Import a Full XML archive or export this account for Achieve."
      >
        <AchieveTransferPanel embedded />
      </TransferDisclosure>
      <TransferDisclosure
        title="RedNotebook"
        description="Import journal month files as dated Planner notes."
      >
        <RedNotebookImportPanel embedded />
      </TransferDisclosure>
      <TransferDisclosure
        title="Tomboy"
        description="Import a Tomboy sync folder or selected .note files."
      >
        <TomboyImportPanel embedded />
      </TransferDisclosure>
      <TransferDisclosure
        title="Transactions"
        description="Import bank and card CSV exports into the Finances register."
      >
        <FinanceImportPanel embedded />
      </TransferDisclosure>
      <TransferDisclosure
        title="Amazon orders"
        description="Import the slim JSON from the Amazon data-request zip (line items, not card lumps)."
      >
        <AmazonImportPanel embedded />
      </TransferDisclosure>
    </div>
  );
}

function TransferDisclosure({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <details className="group border border-rule bg-surface">
      <summary className="flex min-h-tap cursor-pointer list-none items-center gap-3 px-4 py-2.5 marker:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-[0.875rem] font-medium text-ink">{title}</span>
          <span className="block truncate text-[0.75rem] text-ink-muted">
            {description}
          </span>
        </span>
        <span
          aria-hidden
          className="font-mono text-[1rem] text-ink-faint transition-transform group-open:rotate-45"
        >
          +
        </span>
      </summary>
      <div className="border-t border-rule [&_button]:min-h-tap [&_input]:min-h-tap md:[&_button]:min-h-0 md:[&_input]:min-h-0">
        {children}
      </div>
    </details>
  );
}

function AccountPanel({
  email,
  viaDevBypass,
}: {
  email: string;
  viaDevBypass: boolean;
}) {
  return (
    <section className="border border-rule bg-surface">
      <PanelHeading title="Signed-in account" />
      <div className="px-4 py-4">
        <p className="font-mono text-[0.875rem] text-ink">{email}</p>
        {viaDevBypass ? (
          <div className="mt-4 border-l-2 border-priority-b bg-priority-b/10 px-3 py-2">
            <p className="text-[0.8125rem] font-medium text-ink">
              Development bypass active
            </p>
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-muted">
              No browser session selected this identity. AUTH_DEV_BYPASS serves requests
              as this development account; Google linking still requires a real sign-in.
            </p>
          </div>
        ) : (
          <p className="mt-2 text-[0.8125rem] text-ink-muted">
            Preferences, connections, imports, and Planner records on this page belong
            to this account.
          </p>
        )}
        <div className="mt-5 border-t border-rule pt-4">
          <LogoutButton className="min-h-tap w-full rounded border border-rule px-3 py-1.5 text-[0.8125rem] font-medium sm:w-auto md:min-h-0" />
        </div>
      </div>
    </section>
  );
}
