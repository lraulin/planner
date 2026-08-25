import type { CommandIcon } from "@/lib/commands/icons";
import { GLYPH } from "./glyph";

/**
 * The command verbs, drawn.
 *
 * Achieve put an icon in the gutter of every menu and on every toolbar button, and it is the
 * single biggest reason its command surface was readable: a row of eleven bordered *words* has no
 * shape, so you read all eleven every time. A row of shapes has landmarks.
 *
 * These are verbs, not nouns — `navIcons.tsx` holds the views and the shell chrome, `TypeIcon`
 * holds the node kinds. Each is drawn to be told apart from the others *in its own menu section*
 * at 20px: the four movement arrows are the set that has to survive that test, so up/down are
 * vertical and indent/outdent are horizontal with a bar to say what they move relative to.
 *
 * The record is exhaustive over `CommandIcon`, so adding an id in `src/lib/commands/icons.ts`
 * fails the build here until it has a drawing.
 */

/**
 * 16px, not 14.
 *
 * The first pass drew these at `h-3.5` and four rows of the Organize ▸ Expand section came out
 * indistinguishable — three strokes inside a 14px box is mush. The rows are `leading-5`, so 16px
 * fits with room to spare, and every glyph below is drawn with **at most three** elements for the
 * same reason.
 */
function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <svg {...GLYPH} className="h-4 w-4">
      {children}
    </svg>
  );
}

/** A plus, at a given point. The shared mark for "a new row goes here". */
function plus(x: number, y: number, arm = 2.75) {
  return (
    <path
      d={`M${x - arm} ${y}h${arm * 2}M${x} ${y - arm}v${arm * 2}`}
      strokeWidth={1.75}
    />
  );
}

/** A plus, the same one `CaptureIcon` uses — creation is creation wherever it appears. */
function NewIcon() {
  return (
    <Glyph>
      <path d="M10 4.5v11M4.5 10h11" strokeWidth={1.75} />
    </Glyph>
  );
}

/**
 * The three inserts: existing rows as thin lines, and a **plus where the new row lands** — above,
 * below, or indented under. The position of the plus is the whole label, so the lines stay faint and
 * the plus is the heavier stroke.
 *
 * Drawn as a set. These three sit next to each other on the toolbar and in one menu section, so what
 * matters is not that each is clever but that no two are confusable at a glance.
 */
function InsertBeforeIcon() {
  return (
    <Glyph>
      {plus(5.5, 5)}
      <path d="M11 11.5h6M4 16h13" />
    </Glyph>
  );
}

function InsertAfterIcon() {
  return (
    <Glyph>
      <path d="M4 4h13M11 8.5h6" />
      {plus(5.5, 15)}
    </Glyph>
  );
}

function InsertChildIcon() {
  return (
    <Glyph>
      <path d="M4 4h13" />
      <path d="M5 6.5v8h3.5" />
      {plus(13, 14.5)}
    </Glyph>
  );
}

/** Open: the drawer sliding in from the right, which is what actually happens. */
function OpenIcon() {
  return (
    <Glyph>
      <rect x="3" y="4" width="14" height="12" rx="1.5" />
      <path d="M12 4v12" />
      <path d="m6 8.5 2.25 1.5L6 11.5" />
    </Glyph>
  );
}

/** Rename: a pencil. Inline editing of the row's own name, not the whole record. */
function RenameIcon() {
  return (
    <Glyph>
      <path d="m13.25 3.75 3 3-8.5 8.5-3.75.75.75-3.75Z" />
      <path d="m11.5 5.5 3 3" />
    </Glyph>
  );
}

/** Copy: two sheets. */
function CopyIcon() {
  return (
    <Glyph>
      <rect x="7" y="7" width="9.5" height="9.5" rx="1.5" />
      <path d="M13 4.5H5A1 1 0 0 0 4 5.5v8" />
    </Glyph>
  );
}

/** Two ticked rows — select every navigable row, not copy and not complete. */
function SelectAllIcon() {
  return (
    <Glyph>
      <rect x="3.5" y="3.5" width="13" height="5.5" rx="1" />
      <rect x="3.5" y="11" width="13" height="5.5" rx="1" />
      <path d="M6 6.2l1.5 1.5 3-3M6 13.7l1.5 1.5 3-3" />
    </Glyph>
  );
}

/** Delete: Achieve's ✕, not a trash can. It is a row removal, not a recycle bin. */
function DeleteIcon() {
  return (
    <Glyph>
      <path d="m5 5 10 10M15 5 5 15" strokeWidth={1.75} />
    </Glyph>
  );
}

/** Convert: two arrows swapping. A kind change, not a move. */
function ConvertIcon() {
  return (
    <Glyph>
      <path d="M4 7.5h10l-2.5-2.5M16 12.5H6l2.5 2.5" />
    </Glyph>
  );
}

function MoveUpIcon() {
  return (
    <Glyph>
      <path d="M10 16V5m0 0L6 9m4-4 4 4" />
    </Glyph>
  );
}

function MoveDownIcon() {
  return (
    <Glyph>
      <path d="M10 4v11m0 0 4-4m-4 4-4-4" />
    </Glyph>
  );
}

/**
 * Indent and outdent: an arrow *plus* the bar it moves away from or toward. The arrow alone would
 * be the same drawing as a chevron, and one of these two always sits next to the other.
 */
function IndentIcon() {
  return (
    <Glyph>
      <path d="M4 4.5v11" strokeWidth={1.75} />
      <path d="M8 10h8m0 0-3-3m3 3-3 3" />
    </Glyph>
  );
}

function OutdentIcon() {
  return (
    <Glyph>
      <path d="M16 4.5v11" strokeWidth={1.75} />
      <path d="M12 10H4m0 0 3-3m-3 3 3 3" />
    </Glyph>
  );
}

/**
 * Expand / collapse: the tree control's `⊞` and `⊟`.
 *
 * A box with a plus or a minus in it, which is what every outline in the app's lineage used and the
 * only pair that stays legible at 16px. The first pass drew lines-plus-a-chevron and the two came out
 * as the same three horizontal strokes.
 */
function ExpandIcon() {
  return (
    <Glyph>
      <rect x="3.5" y="3.5" width="13" height="13" rx="2" />
      {plus(10, 10, 3)}
    </Glyph>
  );
}

function CollapseIcon() {
  return (
    <Glyph>
      <rect x="3.5" y="3.5" width="13" height="13" rx="2" />
      <path d="M7 10h6" strokeWidth={1.75} />
    </Glyph>
  );
}

/** Expand through level: stepped rows, because a level is a depth and not a count. */
function LevelsIcon() {
  return (
    <Glyph>
      <path d="M3.5 5h13M7 10h9.5M10.5 15h6" />
    </Glyph>
  );
}

/**
 * Priority maintenance: two rows squeezed together, arrows pointing in.
 *
 * Both priority commands renumber a sibling group so the letters run without gaps. The first pass
 * tried drawing the letters A and B; at 16px they were a smudge.
 */
function PriorityIcon() {
  return (
    <Glyph>
      <path d="M3.5 4h13M3.5 16h13" />
      <path d="M10 6.5v7m0-7L7.75 8.75M10 6.5l2.25 2.25m-2.25 4.75L7.75 11.25M10 13.5l2.25-2.25" />
    </Glyph>
  );
}

/** The four zooms: one magnifier, four insides. */
function magnifier(inside: React.ReactNode) {
  return (
    <Glyph>
      <circle cx="8.5" cy="8.5" r="5.25" />
      <path d="m12.5 12.5 4 4" />
      {inside}
    </Glyph>
  );
}

function ZoomInIcon() {
  return magnifier(plus(8.5, 8.5, 2.25));
}

function ZoomOutIcon() {
  return magnifier(<path d="M6.25 8.5h4.5" strokeWidth={1.75} />);
}

/** Clear zoom: the magnifier struck through — back out to the whole outline. */
function ZoomClearIcon() {
  return magnifier(<path d="m6.5 10.5 4-4" strokeWidth={1.75} />);
}

/** Zoom to item: a target inside, because it asks you which item. */
function ZoomToIcon() {
  return magnifier(<circle cx="8.5" cy="8.5" r="1.75" />);
}

/** Filter: the funnel the chip bar and column menus already use. */
function FilterIcon() {
  return (
    <Glyph>
      <path d="M3.5 4.5h13l-5 6v5.5l-3-1.75V10.5Z" />
    </Glyph>
  );
}

/** Show Fields: columns, some of them dropped. */
function FieldsIcon() {
  return (
    <Glyph>
      <rect x="3" y="4.5" width="14" height="11" rx="1.5" />
      <path d="M8 4.5v11" />
      <path d="M12.5 4.5v11" strokeDasharray="2 2" />
    </Glyph>
  );
}

/** Reset: a return arrow. Back to the defaults, not undo. */
function ResetIcon() {
  return (
    <Glyph>
      <path d="M4.5 10a5.5 5.5 0 1 0 1.75-4" />
      <path d="M4 3.5V6.5h3" />
    </Glyph>
  );
}

/** The Commands panel toggle: the layout it produces — content plus a rail on the right. */
function PanelIcon() {
  return (
    <Glyph>
      <rect x="3" y="4.5" width="14" height="11" rx="1.5" />
      <path d="M12.5 4.5v11" />
      <path d="M14 8h2M14 11h2" />
    </Glyph>
  );
}

/** Saved views: a disk, shared by Save / Update / Rename / Delete view. */
function ViewSaveIcon() {
  return (
    <Glyph>
      <path d="M4.5 4.5h8.5l3 3v8h-11.5Z" />
      <path d="M7.5 4.5v3.5h5M7.5 15.5v-4h5v4" />
    </Glyph>
  );
}

/** Schedule a block for this row — the Day/Schedule modules' own verb. */
function ScheduleBlockIcon() {
  return (
    <Glyph>
      <rect x="3" y="4.5" width="14" height="12" rx="1.5" />
      <path d="M3 8h14M7 3.25v2.5M13 3.25v2.5" />
      <rect x="5.5" y="10" width="5" height="4" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

/**
 * Complete: a tick. The one state change with a verb of its own, so it gets the mark rather
 * than the picker's box.
 */
function CompleteIcon() {
  return (
    <Glyph>
      <path d="M4.5 10.5l4 4 7-9" strokeWidth={1.75} />
    </Glyph>
  );
}

/** The State family: a box with a mark in it — "set this row's state to…". */
function StateIcon() {
  return (
    <Glyph>
      <rect x="3.5" y="3.5" width="13" height="13" rx="2" />
      <path d="M6.75 10.25l2.5 2.5 4-5" />
    </Glyph>
  );
}

/** Pickup rows: scissors. Achieve's Pickup Row(s) is a cut, and it reads as one. */
function CutIcon() {
  return (
    <Glyph>
      <path d="M6 3.5l8 9.5M14 3.5l-8 9.5" />
      <circle cx="5.5" cy="15" r="1.75" />
      <circle cx="14.5" cy="15" r="1.75" />
    </Glyph>
  );
}

/**
 * Attach: a paperclip. One stroke so it stays a clip at 16px, not a knot.
 */
function AttachIcon() {
  return (
    <Glyph>
      <path d="M8 13.5 13.25 8.25a2.5 2.5 0 0 0-3.5-3.5L5.5 9a1.75 1.75 0 1 0 2.5 2.5l3.75-3.75" />
    </Glyph>
  );
}

/**
 * Paste: a clipboard. Deliberately not `CopyIcon`'s two overlapping sheets — cut and paste are
 * one round trip and the pair has to be told apart at a glance in the same section.
 */
function PasteIcon() {
  return (
    <Glyph>
      <path d="M7.5 4.5H5.5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-10a1 1 0 0 0-1-1h-2" />
      <rect x="7.5" y="3" width="5" height="3" rx="0.75" />
    </Glyph>
  );
}

/** Download: a tray with an arrow into it. File ▸ Export ▸ CSV / JSON / YAML. */
function ExportIcon() {
  return (
    <Glyph>
      <path d="M5 13.5v2a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2" />
      <path d="M10 4.5v8M7 10l3 3 3-3" />
    </Glyph>
  );
}

/** Upload: a tray with an arrow out of it. File ▸ Import — the inverse of Export. */
function ImportIcon() {
  return (
    <Glyph>
      <path d="M5 13.5v2a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2" />
      <path d="M10 12.5v-8M7 7l3-3 3 3" />
    </Glyph>
  );
}

/** Cross-navigation: an arrow leaving its box. "Show me this somewhere else." */
function GoToIcon() {
  return (
    <Glyph>
      <path d="M15.5 11v4.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1H10" />
      <path d="M12.5 3.5h4v4M16.5 3.5l-6.5 6.5" />
    </Glyph>
  );
}

/** Settings: sliders, not a gear — three strokes stay readable at 16px. */
function SettingsIcon() {
  return (
    <Glyph>
      <path d="M4 6.5h12M4 13.5h12" />
      <path d="M8 4.5v4M13 11.5v4" strokeWidth={1.75} />
    </Glyph>
  );
}

/** Sign out: an arrow leaving a doorway. */
function SignOutIcon() {
  return (
    <Glyph>
      <path d="M8.5 4.5H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3.5" />
      <path d="M10 10h6.5M14 7.25 16.75 10 14 12.75" />
    </Glyph>
  );
}

export const COMMAND_ICONS: Record<CommandIcon, () => React.ReactElement> = {
  new: NewIcon,
  "insert-before": InsertBeforeIcon,
  "insert-after": InsertAfterIcon,
  "insert-child": InsertChildIcon,
  open: OpenIcon,
  rename: RenameIcon,
  "select-all": SelectAllIcon,
  copy: CopyIcon,
  attach: AttachIcon,
  delete: DeleteIcon,
  convert: ConvertIcon,
  "move-up": MoveUpIcon,
  "move-down": MoveDownIcon,
  indent: IndentIcon,
  outdent: OutdentIcon,
  expand: ExpandIcon,
  collapse: CollapseIcon,
  levels: LevelsIcon,
  priority: PriorityIcon,
  "zoom-in": ZoomInIcon,
  "zoom-out": ZoomOutIcon,
  "zoom-clear": ZoomClearIcon,
  "zoom-to": ZoomToIcon,
  filter: FilterIcon,
  fields: FieldsIcon,
  reset: ResetIcon,
  panel: PanelIcon,
  "view-save": ViewSaveIcon,
  schedule: ScheduleBlockIcon,
  state: StateIcon,
  complete: CompleteIcon,
  cut: CutIcon,
  paste: PasteIcon,
  "go-to": GoToIcon,
  export: ExportIcon,
  import: ImportIcon,
  settings: SettingsIcon,
  "sign-out": SignOutIcon,
};

/**
 * Render a command's glyph, or nothing.
 *
 * Nothing rather than a placeholder: a menu where some rows have an icon and some have a blank
 * gutter still lines up, and a fallback glyph would say "this command is a kind of thing we have
 * no word for", which is worse than silence.
 */
export function CommandGlyph({ icon }: { icon: CommandIcon | undefined }) {
  if (!icon) return null;
  const Icon = COMMAND_ICONS[icon];
  return <Icon />;
}
