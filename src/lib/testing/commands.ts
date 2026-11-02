import type { KeyEventLike } from "@/lib/commands/bindings";
import type { Command } from "@/lib/commands/registry";

/** A record command labelled by its id that does nothing when run. */
export function testCommand(id: string, extra: Partial<Command> = {}): Command {
  return { id, label: id, group: "record", run: () => {}, ...extra };
}

/** A key press with no modifiers held unless `held` says so. */
export function keyPress(key: string, held: Partial<KeyEventLike> = {}): KeyEventLike {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...held,
  };
}
