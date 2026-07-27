"use client";

/**
 * Tabs grouping the sections of one record's form — the pattern `ux-principles.md`
 * explicitly endorses, and the one Achieve uses for these same forms.
 *
 * Only the active tab is rendered. With eleven tabs on a Project, mounting them all would
 * mean eleven tabs' worth of inputs and sub-grids on every open, and "performance is UX".
 * Form state lives in the parent, so an unmounted tab loses nothing.
 */
export type FormTab = {
  id: string;
  label: string;
  render: () => React.ReactNode;
};

export function FormTabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: FormTab[];
  active: string;
  onSelect: (id: string) => void;
}) {
  const current = tabs.find((tab) => tab.id === active) ?? tabs[0];

  return (
    <>
      <div
        role="tablist"
        aria-label="Form sections"
        // Eleven tabs will not fit on a phone, so the strip scrolls rather than wrapping
        // into a block that pushes the form off screen.
        className="flex flex-none gap-0.5 overflow-x-auto border-b border-rule px-3"
      >
        {tabs.map((tab) => {
          const selected = tab.id === current.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              onClick={() => onSelect(tab.id)}
              onKeyDown={(event) => {
                const step =
                  event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
                if (step === 0) return;
                event.preventDefault();
                const index = tabs.findIndex((t) => t.id === tab.id);
                const next = (index + step + tabs.length) % tabs.length;
                onSelect(tabs[next].id);
                document.getElementById(`tab-${tabs[next].id}`)?.focus();
              }}
              tabIndex={selected ? 0 : -1}
              className={[
                "flex-none whitespace-nowrap border-b-2 px-3 py-2 text-[0.8125rem] transition-colors",
                selected
                  ? "border-select-edge font-medium text-ink"
                  : "border-transparent text-ink-muted hover:text-ink",
              ].join(" ")}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`panel-${current.id}`}
        aria-labelledby={`tab-${current.id}`}
        className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
      >
        <div className="flex flex-col gap-5">{current.render()}</div>
      </div>
    </>
  );
}
