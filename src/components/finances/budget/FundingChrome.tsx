import type { EnvelopeIndicator } from "@/lib/finances/budget/indicator";
import { formatUsd } from "@/lib/finances/money";

const PILL: Record<EnvelopeIndicator["pill"], string> = {
  green:
    "bg-[color-mix(in_srgb,var(--chart-income)_28%,var(--surface))] text-[var(--chart-income)]",
  yellow:
    "bg-[color-mix(in_srgb,var(--goal-unmet)_32%,var(--surface))] text-[var(--goal-unmet)]",
  red: "bg-[color-mix(in_srgb,var(--chart-spend)_28%,var(--surface))] text-[var(--chart-spend)]",
  gray: "bg-surface-raised text-ink-faint",
};

const FILL: Record<EnvelopeIndicator["pill"], string> = {
  green: "bg-[var(--chart-income)]",
  yellow: "bg-[var(--goal-unmet)]",
  red: "bg-[var(--chart-spend)]",
  gray: "bg-ink-faint/50",
};

function ClockIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
      <circle
        cx="6"
        cy="6"
        r="4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path
        d="M6 3.5V6l2 1.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
      <circle cx="6" cy="6" r="4.5" fill="currentColor" opacity="0.2" />
      <path
        d="M3.75 6.2 5.3 7.8 8.4 4.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PieIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
      <circle
        cx="6"
        cy="6"
        r="4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path d="M6 6V1.5A4.5 4.5 0 0 1 10 8.4Z" fill="currentColor" />
    </svg>
  );
}

function FundingIcon({ icon }: { icon: EnvelopeIndicator["icon"] }) {
  if (icon === "clock") return <ClockIcon />;
  if (icon === "check") return <CheckIcon />;
  if (icon === "pie") return <PieIcon />;
  return null;
}

export function FundingBar({ indicator }: { indicator: EnvelopeIndicator }) {
  if (!indicator.bar) return null;
  const { fill01, spent01, striped } = indicator.bar;
  const fill = `${Math.round(fill01 * 1000) / 10}%`;
  const spent = `${Math.round(spent01 * 1000) / 10}%`;
  return (
    <div className="h-[3px] w-full overflow-hidden rounded-full bg-rule">
      <div
        className={`relative h-full overflow-hidden rounded-full ${FILL[indicator.pill]}`}
        style={{
          width: fill,
          backgroundImage: striped
            ? "repeating-linear-gradient(-45deg, transparent, transparent 2px, rgb(255 255 255 / 0.45) 2px, rgb(255 255 255 / 0.45) 4px)"
            : undefined,
        }}
      >
        {!striped && spent01 > 0 ? (
          <div
            className="absolute inset-y-0 left-0 bg-white/45"
            style={{ width: spent }}
          />
        ) : null}
      </div>
    </div>
  );
}

export function AvailablePill({
  cents,
  indicator,
  label,
  disabled,
  onOpen,
}: {
  cents: number;
  indicator: EnvelopeIndicator;
  label: string;
  disabled: boolean;
  onOpen: (at: { x: number; y: number }) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(event) => onOpen({ x: event.clientX, y: event.clientY })}
      title={indicator.copy ?? "Cover, move money, or roll overspending forward"}
      aria-label={`Available in ${label}: ${formatUsd(cents)}`}
      className={`tabular inline-flex min-h-tap items-center gap-1 rounded-full px-2 text-[0.8125rem] font-medium md:min-h-0 md:py-0.5 ${PILL[indicator.pill]}`}
    >
      <FundingIcon icon={indicator.icon} />
      {formatUsd(cents)}
    </button>
  );
}
