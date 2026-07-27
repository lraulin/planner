/**
 * The tab strip from Achieve. Only Outline exists so far; the rest are shown so the shape
 * of the app is legible, and marked as not built rather than hidden.
 */
const TABS = [
  { id: "outline", label: "Outline", built: true },
  { id: "projects", label: "Projects", built: false },
  { id: "tasks", label: "Tasks", built: false },
  { id: "schedule", label: "Weekly Schedule", built: false },
  { id: "notes", label: "Notes", built: false },
] as const;

export function TabStrip({ active }: { active: (typeof TABS)[number]["id"] }) {
  return (
    <header className="flex flex-none items-end gap-px border-b border-rule bg-shell px-3 pt-2">
      <h1 className="mr-4 pb-2 text-[0.8125rem] font-semibold tracking-tight text-ink-muted">
        Planner
      </h1>

      <nav className="flex items-end gap-px" aria-label="Views">
        {TABS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <span
              key={tab.id}
              aria-current={isActive ? "page" : undefined}
              title={tab.built ? undefined : "Not built yet"}
              className={[
                "px-3 py-1.5 text-[0.8125rem] leading-none",
                isActive
                  ? "rounded-t border-x border-t border-rule bg-surface font-medium text-ink"
                  : tab.built
                    ? "text-ink-muted"
                    : "cursor-default text-ink-faint/60",
              ].join(" ")}
            >
              {tab.label}
            </span>
          );
        })}
      </nav>
    </header>
  );
}
