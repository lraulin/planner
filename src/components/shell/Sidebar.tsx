"use client";

import { LogoutButton } from "@/components/auth/LogoutButton";
import { CaptureButton } from "@/components/capture/CaptureButton";
import { useSetting } from "@/components/settings/SettingsProvider";
import { parseShellSettings, serializeShellSettings } from "@/lib/settings/shell";
import { SHELL_SCOPE } from "@/lib/settings/scopes";
import { ChevronIcon, OrganizeIcon, SettingsIcon } from "./navIcons";
import { openCommandPalette } from "./commandEvent";
import { sectionsWithModules, type ModuleId } from "./modules";
import { NavLink } from "./NavLink";

/**
 * Desktop navigation: a grouped, collapsible left rail, replacing the tab strip.
 *
 * The strip held eleven modules in one non-wrapping row and had nowhere to put a twelfth.
 * Sections turn that into a problem of vertical space, which is the space this app has —
 * eleven entries under four headings fit comfortably where eleven tabs across did not.
 *
 * Sections come from `sectionsWithModules()`, shared with the phone's More sheet so the two
 * cannot group the app differently. Settings and Sign out sit below the sections because
 * they are chrome, not modules.
 */

/**
 * The codec is module-level, per `useSetting`'s contract: one rebuilt inline would re-parse
 * the blob on every render.
 */
const SHELL_CODEC = {
  parse: parseShellSettings,
  serialize: serializeShellSettings,
};

export function Sidebar({ active }: { active: ModuleId | null }) {
  const { value, patch } = useSetting(SHELL_SCOPE, SHELL_CODEC);
  const collapsed = value.sidebarCollapsed;

  const sections = sectionsWithModules();

  return (
    <nav
      aria-label="Modules"
      // `hidden md:flex`, not a width transition: below `md` the phone owns navigation
      // entirely (`responsive.md` — adaptive, not shrunken), so there is nothing here to
      // narrow.
      // Keep desktop nav above drawer backdrops so navigating away is always possible.
      className={`hidden flex-none flex-col border-r border-rule bg-shell md:relative md:z-50 md:flex ${
        collapsed ? "w-12" : "w-44"
      }`}
    >
      <div
        className={`flex flex-none items-center gap-1 px-2 py-2 ${
          collapsed ? "justify-center" : ""
        }`}
      >
        {!collapsed && (
          <span className="flex-1 truncate pl-1 text-[0.8125rem] font-semibold tracking-tight text-ink-muted">
            Planner
          </span>
        )}
        <button
          type="button"
          onClick={() =>
            patch((current) => ({ ...current, sidebarCollapsed: !collapsed }))
          }
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex h-6 w-6 flex-none items-center justify-center rounded text-ink-faint hover:bg-surface-raised hover:text-ink"
        >
          <ChevronIcon pointing={collapsed ? "right" : "left"} />
        </button>
      </div>

      {/*
        The palette is the Go menu, and a keyboard-only Go menu is the thing
        `ux-principles.md` calls not-a-discoverable-action. This row is what teaches ⌘K.
      */}
      <button
        type="button"
        onClick={openCommandPalette}
        title="Search modules and commands (⌘K)"
        className={`mx-2 mb-2 flex flex-none items-center gap-2 rounded border border-rule px-2 py-1 text-[0.75rem] text-ink-faint hover:border-rule-strong hover:bg-surface-raised hover:text-ink ${
          collapsed ? "justify-center" : ""
        }`}
      >
        <SearchGlyph />
        {!collapsed && (
          <>
            <span className="flex-1 text-left">Search…</span>
            <span className="tabular flex-none text-[0.6875rem]">⌘K</span>
          </>
        )}
      </button>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {sections.map((section) => (
          <div key={section.id} className="mb-3 last:mb-0">
            {/*
              A collapsed rail has no room for a heading, and a heading truncated to two
              characters is worse than none — the gap between groups still carries the
              grouping.
            */}
            {!collapsed && (
              <h2 className="px-2 pb-1 text-[0.625rem] font-semibold uppercase tracking-wider text-ink-faint">
                {section.label}
              </h2>
            )}

            {section.modules.map((entry) => {
              const Icon = entry.icon;
              const isActive = entry.id === active;

              return (
                <NavLink
                  key={entry.id}
                  href={entry.href}
                  aria-current={isActive ? "page" : undefined}
                  title={collapsed ? entry.label : undefined}
                  className={`flex items-center gap-2 rounded px-2 py-1 text-[0.8125rem] leading-6 ${
                    collapsed ? "justify-center" : ""
                  } ${
                    isActive
                      ? "bg-select font-medium text-ink"
                      : "text-ink-muted hover:bg-surface-raised hover:text-ink"
                  }`}
                >
                  <span className="flex-none">
                    <Icon />
                  </span>
                  {!collapsed && <span className="truncate">{entry.label}</span>}
                </NavLink>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-none flex-col gap-2 border-t border-rule px-2 py-2">
        <CaptureButton compact={collapsed} />

        <NavLink
          href="/organize"
          title={collapsed ? "Process Inbox" : undefined}
          className={`flex items-center gap-2 rounded border border-rule px-2 py-1 text-[0.8125rem] leading-none text-ink-muted hover:border-rule-strong hover:bg-surface-raised hover:text-ink ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <span className="flex-none">
            <OrganizeIcon />
          </span>
          {!collapsed && <span className="truncate">Process Inbox</span>}
        </NavLink>

        <NavLink
          href="/settings"
          title={collapsed ? "Settings" : undefined}
          className={`flex items-center gap-2 rounded px-2 py-1 text-[0.8125rem] leading-6 text-ink-muted hover:bg-surface-raised hover:text-ink ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <span className="flex-none">
            <SettingsIcon />
          </span>
          {!collapsed && <span className="truncate">Settings</span>}
        </NavLink>

        {!collapsed && (
          <div className="px-2">
            <LogoutButton />
          </div>
        )}
      </div>
    </nav>
  );
}

/** Local to the sidebar's search row; not a module glyph, so it stays out of `navIcons`. */
function SearchGlyph() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      aria-hidden
      className="h-3.5 w-3.5 flex-none"
    >
      <circle cx="8.75" cy="8.75" r="5" />
      <path d="m12.5 12.5 4 4" />
    </svg>
  );
}
