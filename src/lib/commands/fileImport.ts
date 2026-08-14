/**
 * File ▸ Import — one command per page, same shape everywhere.
 *
 * Export is a format picker and nests. Import is one panel per page, so a single
 * command stays a File row rather than a fly-out onto one item.
 */

import type { Command } from "./registry";

export const FILE_IMPORT_SECTION = "Import";

export function fileImportCommand(params: {
  id: string;
  label: string;
  keywords: string;
  run: () => void;
}): Command {
  return {
    id: params.id,
    label: params.label,
    group: "view",
    menu: "file",
    section: FILE_IMPORT_SECTION,
    icon: "import",
    keywords: params.keywords,
    run: params.run,
  };
}
