import { describe, expect, it, vi } from "vitest";
import { unplacedCommands } from "@/lib/commands/fileCommands";

import { insightsCommands } from "./insightsCommands";

describe("insightsCommands", () => {
  it("ships Reclassify through Tools and therefore every command surface", () => {
    const reclassify = vi.fn();
    const commands = insightsCommands({
      hasRows: true,
      reclassifying: false,
      reclassify,
    });

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      id: "finances.reclassify",
      label: "Rebuild transaction classifications",
      group: "view",
      menu: "tools",
      disabled: false,
    });
    expect(unplacedCommands(commands)).toEqual([]);

    commands[0].run();
    expect(reclassify).toHaveBeenCalledOnce();
  });

  it("keeps the command visible with a specific reason when it cannot run", () => {
    const [empty] = insightsCommands({
      hasRows: false,
      reclassifying: false,
      reclassify: () => undefined,
    });
    const [running] = insightsCommands({
      hasRows: true,
      reclassifying: true,
      reclassify: () => undefined,
    });

    expect(empty).toMatchObject({
      disabled: true,
      title: "There are no transactions to reclassify.",
    });
    expect(running).toMatchObject({
      disabled: true,
      title: "Reclassification is already running.",
    });
  });
});
