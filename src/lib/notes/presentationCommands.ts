import type { Command } from "@/lib/commands/registry";
import type { NotesPresentation } from "@/lib/settings/notes";

/** View ▸ Grid / Journal — one pair, registered by whichever presentation is mounted. */
export function notesPresentationCommands(
  presentation: NotesPresentation,
  setPresentation: (next: NotesPresentation) => void,
): Command[] {
  return [
    {
      id: "notes.presentation-grid",
      label: "Grid",
      group: "view",
      menu: "view",
      section: "Layout",
      keywords: "list notes table",
      title: "The Notes grid",
      disabled: presentation === "grid",
      run: () => setPresentation("grid"),
    },
    {
      id: "notes.presentation-journal",
      label: "Journal",
      group: "view",
      menu: "view",
      section: "Layout",
      keywords: "diary calendar date tree",
      title: "Calendar, date tree, and a write pane",
      disabled: presentation === "journal",
      run: () => setPresentation("journal"),
    },
  ];
}
