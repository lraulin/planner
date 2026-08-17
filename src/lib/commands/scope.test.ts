import { describe, expect, it, vi } from "vitest";
import type { Command } from "./registry";
import {
  scopeCommand,
  scopedCommandId,
  scopedFieldsLabel,
  scopedFilterLabel,
  scopedFormatLabel,
  scopedResetLabel,
} from "./scope";

const BILLS = { id: "bills", label: "Subscriptions & bills" } as const;

function command(extra: Partial<Command> = {}): Command {
  return {
    id: "view.filter",
    label: "Filter…",
    group: "view",
    menu: "view",
    run: () => {},
    ...extra,
  };
}

describe("command scope", () => {
  it("keeps the base id unique per grid so last-wins cannot steal the other one", () => {
    expect(scopedCommandId("view.filter", BILLS)).toBe("view.filter.bills");
    expect(scopedCommandId("grid.export-csv", BILLS)).toBe("grid.export-csv.bills");
  });

  it("names the grid in the verb, not as a vague Filter…", () => {
    expect(scopedFilterLabel(BILLS)).toBe("Filter for Subscriptions & bills…");
    expect(scopedFieldsLabel(BILLS)).toBe("Show Fields for Subscriptions & bills");
    expect(scopedResetLabel(BILLS)).toBe("Reset Subscriptions & bills");
    expect(scopedFormatLabel("CSV", BILLS)).toBe("CSV — Subscriptions & bills");
  });

  it("rewrites id, label, keywords and the Option-held alternate together", () => {
    const run = vi.fn();
    const scoped = scopeCommand(
      command({
        keywords: "advanced condition",
        alternate: { label: "Copy CSV to Clipboard", run },
      }),
      BILLS,
      scopedFilterLabel(BILLS),
    );

    expect(scoped).toMatchObject({
      id: "view.filter.bills",
      label: "Filter for Subscriptions & bills…",
      keywords: "advanced condition Subscriptions & bills",
      alternate: { label: "Copy CSV to Clipboard — Subscriptions & bills" },
    });
    scoped.alternate?.run();
    expect(run).toHaveBeenCalledOnce();
  });
});
