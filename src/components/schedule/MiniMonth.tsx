"use client";

import { toDateKey } from "@/lib/schedule/geometry";

type Props = {
  month: Date;
  selected: Date;
  onSelectDay: (d: Date) => void;
  onChangeMonth: (d: Date) => void;
};

export function MiniMonth({ month, selected, onSelectDay, onChangeMonth }: Props) {
  const year = month.getFullYear();
  const mon = month.getMonth();
  const first = new Date(year, mon, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const selectedKey = toDateKey(selected);
  const todayKey = toDateKey(new Date());

  const cells: Array<{ day: number | null; date: Date | null }> = [];
  for (let i = 0; i < startPad; i++) cells.push({ day: null, date: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, date: new Date(year, mon, d) });
  }

  return (
    <div className="text-[0.75rem]">
      <div className="mb-1 flex items-center justify-between">
        <button
          type="button"
          className="px-1 text-ink-muted hover:text-ink"
          aria-label="Previous month"
          onClick={() => onChangeMonth(new Date(year, mon - 1, 1))}
        >
          ‹
        </button>
        <span className="font-medium text-ink">
          {first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </span>
        <button
          type="button"
          className="px-1 text-ink-muted hover:text-ink"
          aria-label="Next month"
          onClick={() => onChangeMonth(new Date(year, mon + 1, 1))}
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-px text-center text-ink-faint">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={`${d}-${i}`} className="py-0.5">
            {d}
          </div>
        ))}
        {cells.map((c, i) => {
          if (!c.date || c.day == null) {
            return <div key={`e-${i}`} />;
          }
          const key = toDateKey(c.date);
          const isSelected = key === selectedKey;
          const isToday = key === todayKey;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay(c.date!)}
              className={[
                "rounded py-0.5 tabular",
                isSelected
                  ? "bg-select-edge text-white"
                  : isToday
                    ? "font-semibold text-select-edge"
                    : "text-ink hover:bg-surface-raised",
              ].join(" ")}
            >
              {c.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
