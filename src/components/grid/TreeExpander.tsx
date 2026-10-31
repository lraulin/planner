/**
 * The front of a tree row's name cell: one spine per level of depth, then the expand /
 * collapse toggle. Shared by the outline and Notes so the two trees indent and tap alike.
 *
 * The toggle's layout width stays `w-4` so the name gutter and compact meta-line padding
 * stay aligned (`--name-gutter`). Below `md`, a centred 44px `::before` grows the hit area
 * without the glyph or the row density (`responsive.md`). A row that cannot expand keeps
 * the gutter for alignment but takes no taps.
 */
export function TreeExpander({
  depth,
  collapsed,
  expandable,
  onToggle,
}: {
  depth: number;
  collapsed: boolean;
  expandable: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      {Array.from({ length: depth }, (_, level) => (
        <span key={level} aria-hidden className="spine" />
      ))}

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        title={collapsed ? "Expand" : "Collapse"}
        aria-label={collapsed ? "Expand" : "Collapse"}
        tabIndex={-1}
        className={[
          "relative mr-1 ml-0.5 flex w-4 flex-none items-center justify-center text-[0.625rem] text-ink-faint",
          expandable
            ? "hover:text-ink before:absolute before:top-1/2 before:left-1/2 before:h-tap before:w-tap before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] md:before:hidden"
            : "pointer-events-none invisible",
        ].join(" ")}
      >
        {collapsed ? "▶" : "▼"}
      </button>
    </>
  );
}
