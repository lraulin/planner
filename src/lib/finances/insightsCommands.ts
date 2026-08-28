import type { Command } from "@/lib/commands/registry";

export function insightsCommands(options: {
  hasRows: boolean;
  reclassifying: boolean;
  reclassify: () => void;
}): Command[] {
  const unavailableReason = options.reclassifying
    ? "Reclassification is already running."
    : !options.hasRows
      ? "There are no transactions to reclassify."
      : undefined;

  return [
    {
      id: "finances.reclassify",
      label: "Reclassify…",
      group: "view",
      menu: "tools",
      keywords: "transactions payees merchants flows rebuild repair classifier",
      disabled: unavailableReason !== undefined,
      title:
        unavailableReason ?? "Recompute derived flow and payee identity for every row.",
      run: options.reclassify,
    },
  ];
}
