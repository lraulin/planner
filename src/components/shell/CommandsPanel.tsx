"use client";

import { formatBindings } from "@/lib/commands/bindings";
import { buildMenus, type MenuSection } from "@/lib/commands/menus";
import { CommandGlyph } from "@/components/icons/commandIcons";
import { ChevronIcon } from "./navIcons";
import { useCommands } from "./CommandProvider";
import { useCommandsPanel } from "./useShellSettings";

/**
 * The Commands panel — Achieve's docked **Outline Commands** pane, modernised.
 *
 * The menu bar answers "what can I do here" one menu at a time. This answers it all at once, for
 * people who would rather read than remember: the same declared tree, left open, in the sidebar's
 * exact row treatment so the two rails read as one frame rather than two designs.
 *
 * Opt-in and remembered per user (`shell` scope), because it costs 208px of grid width and a
 * datagrid app spends width on columns. Off by default; the toggle is on every command row and the
 * command is in `View ▸ Panels`.
 *
 * Not rendered below `md`: `responsive.md` is adaptive-not-shrunken, and a 208px pane on a 390px
 * screen is a different product rather than a narrower panel. Down there `⋯` holds the same tree.
 */
export function CommandsPanel() {
  const commands = useCommands();
  const { open, collapsed, setOpen, toggleSection } = useCommandsPanel();

  const menus = buildMenus(commands);

  // Nothing registered means no panel, even when the setting says open — `/settings` and `/login`
  // have no commands, and an empty 208px rail there would read as a rendering bug.
  if (!open || menus.length === 0) return null;

  return (
    <aside
      aria-label="Commands"
      className="hidden w-52 flex-none flex-col border-l border-rule bg-shell md:flex"
    >
      <div className="flex flex-none items-center gap-1 border-b border-rule px-3 py-2">
        <h2 className="flex-1 text-[0.625rem] font-semibold uppercase tracking-wider text-ink-faint">
          Commands
        </h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          title="Hide the commands panel"
          aria-label="Hide the commands panel"
          className="flex h-6 w-6 flex-none items-center justify-center rounded text-ink-faint hover:bg-surface-raised hover:text-ink"
        >
          <ChevronIcon pointing="right" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {menus.map((menu) =>
          menu.sections.map((section, index) => (
            <Section
              key={`${menu.id}-${index}`}
              // An unlabelled section takes its menu's name: the panel is flat, so a run of rows
              // with no heading would look like it belonged to whatever came above it.
              label={section.label ?? menu.label}
              section={section}
              collapsed={collapsed[section.label ?? menu.label] === true}
              onToggle={toggleSection}
            />
          )),
        )}
      </div>
    </aside>
  );
}

/**
 * One collapsible group.
 *
 * Achieve's panel had exactly this — five headed groups with a chevron each — and it is the reason a
 * pane with thirty commands in it stayed usable. Collapse state is per section *label*, so folding
 * Zoom away on the Outline keeps it folded on the Notes grid, which is what someone folding it away
 * meant.
 */
function Section({
  label,
  section,
  collapsed,
  onToggle,
}: {
  label: string;
  section: MenuSection;
  collapsed: boolean;
  onToggle: (label: string) => void;
}) {
  return (
    <div className="mb-2 last:mb-0">
      <button
        type="button"
        onClick={() => onToggle(label)}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-1 rounded px-2 pb-1 text-left text-[0.625rem] font-semibold uppercase tracking-wider text-ink-faint hover:text-ink"
      >
        <span className="flex-1 truncate">{label}</span>
        <ChevronIcon pointing={collapsed ? "left" : "down"} className="h-3 w-3" />
      </button>

      {!collapsed &&
        section.commands.map((command) => {
          const shortcut = formatBindings(command.bindings);
          return (
            <button
              key={command.id}
              type="button"
              onClick={command.run}
              disabled={command.disabled}
              // On a disabled row this is the sentence that matters — "Select a row first" is the
              // difference between an unavailable control and a broken one (`navigation.md`).
              title={command.title ?? command.label}
              className={[
                "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[0.8125rem] leading-6",
                command.disabled
                  ? "cursor-not-allowed text-ink-faint"
                  : command.destructive
                    ? "text-priority-a hover:bg-surface-raised"
                    : "text-ink-muted hover:bg-surface-raised hover:text-ink",
              ].join(" ")}
            >
              <span className="flex h-4 w-4 flex-none items-center justify-center">
                <CommandGlyph icon={command.icon} />
              </span>
              <span className="flex-1 truncate">{command.label}</span>
              {shortcut && (
                <span className="tabular flex-none text-[0.6875rem] text-ink-faint">
                  {shortcut}
                </span>
              )}
            </button>
          );
        })}
    </div>
  );
}
