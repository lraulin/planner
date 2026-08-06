/**
 * The one SVG preset every hand-drawn glyph in the app spreads.
 *
 * It lived in `shell/navIcons.tsx` while the nav was the only thing with icons. The command
 * surface now draws twenty-odd more (`commandIcons.tsx`), and two `BASE` constants would be two
 * stroke weights — which is exactly the kind of drift you only notice once a menu gutter sits
 * beside a sidebar rail and one of them looks thinner.
 *
 * Hand-drawn rather than pulled from an icon package: `tech-stack.md` — the app has no component
 * library, and forty 20px glyphs still do not justify a dependency. They inherit `currentColor`,
 * so enabled/disabled/active states belong to whatever renders them.
 */
export const GLYPH = {
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;
