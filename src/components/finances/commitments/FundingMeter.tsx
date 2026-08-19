"use client";

/**
 * How far along a hold is, as a bar plus the two figures it sits between.
 *
 * The bar is the point of this component and of the column it lives in. A commitment used to
 * show a checkbox and a monthly average, neither of which was the number being held back, so
 * the one thing the feature does — put a slice of each paycheck aside until the charge lands —
 * was invisible on the page where you decide what to track. Reading `$8.28 of $71.88` beside a
 * bar three-quarters empty explains the whole mechanism without a word of help text.
 *
 * Three colours, three states worth telling apart at a glance: accruing, funded, in trouble.
 */
export type MeterTone = "accruing" | "funded" | "over";

const TONE_COLOR: Record<MeterTone, string> = {
  accruing: "var(--chart-average)",
  funded: "var(--chart-income)",
  over: "var(--chart-spend)",
};

export function FundingMeter({
  heldCents,
  targetCents,
  tone,
  title,
}: {
  heldCents: number;
  targetCents: number;
  tone: MeterTone;
  title: string;
}) {
  const filled =
    targetCents <= 0 ? 0 : Math.min(100, Math.round((heldCents / targetCents) * 100));

  return (
    <span
      title={title}
      aria-hidden
      className="inline-block h-1.5 w-9 flex-none overflow-hidden rounded-full bg-rule align-middle"
    >
      <span
        className="block h-full rounded-full"
        style={{ width: `${filled}%`, background: TONE_COLOR[tone] }}
      />
    </span>
  );
}
