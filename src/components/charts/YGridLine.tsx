/**
 * One horizontal gridline across a hand-drawn SVG chart, with its value labelled in the
 * left margin. The label sits a third of its height below the line, so it centres on it.
 */
export function YGridLine({
  y,
  left,
  right,
  fontSize,
  label,
}: {
  y: number;
  /** Where the plot starts; the label ends 6px before it. */
  left: number;
  right: number;
  fontSize: number;
  label: string;
}) {
  return (
    <g>
      <line x1={left} x2={right} y1={y} y2={y} stroke="var(--rule)" strokeWidth={1} />
      <text
        x={left - 6}
        y={y + fontSize / 3}
        textAnchor="end"
        className="fill-ink-muted"
        style={{ fontSize }}
      >
        {label}
      </text>
    </g>
  );
}
