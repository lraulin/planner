"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Command } from "@/lib/commands/registry";
import { advanceCommandChurn, initialCommandChurnState } from "@/lib/commands/churn";

/**
 * Where a view publishes what it can do, and where the two renderers read it.
 *
 * The palette and the `⋯` overflow both call `useCommands()`, so they cannot disagree about
 * what is available or what it is called — the whole point of one registry. A view calls
 * `useRegisterCommands(...)` and forgets about it; unmounting takes its commands with it, so
 * navigating away can never leave the Tasks grid's Reset behind on the calendar.
 *
 * Contextual rather than global because most commands only mean something on one screen.
 * The genuinely app-wide ones (Settings, capture, Plan Week…) are built in `globalCommands`
 * and merged underneath these.
 */

type Registration = { key: number; commands: readonly Command[] };

type CommandContextValue = {
  commands: readonly Command[];
  register: (key: number, commands: readonly Command[]) => void;
  unregister: (key: number) => void;
  /** How many components are currently claiming the keyboard. See `useSuspendCommandKeys`. */
  suspensions: number;
  suspend: () => void;
  resume: () => void;
};

const CommandContext = createContext<CommandContextValue | null>(null);

let nextKey = 0;

export function CommandProvider({ children }: { children: React.ReactNode }) {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [suspensions, setSuspensions] = useState(0);

  const register = useCallback((key: number, commands: readonly Command[]) => {
    setRegistrations((current) => {
      const rest = current.filter((entry) => entry.key !== key);
      return [...rest, { key, commands }];
    });
  }, []);

  const unregister = useCallback((key: number) => {
    setRegistrations((current) => current.filter((entry) => entry.key !== key));
  }, []);

  const suspend = useCallback(() => setSuspensions((count) => count + 1), []);
  const resume = useCallback(
    () => setSuspensions((count) => Math.max(0, count - 1)),
    [],
  );

  const commands = useMemo(
    () => registrations.flatMap((entry) => entry.commands),
    [registrations],
  );

  const value = useMemo(
    () => ({ commands, register, unregister, suspensions, suspend, resume }),
    [commands, register, unregister, suspensions, suspend, resume],
  );

  return <CommandContext.Provider value={value}>{children}</CommandContext.Provider>;
}

/**
 * Everything the current view has published. Empty outside a provider, never a throw — a
 * grid rendered somewhere without the shell should lose its `⋯`, not crash.
 */
export function useCommands(): readonly Command[] {
  return useContext(CommandContext)?.commands ?? [];
}

/** True while any component is claiming the keyboard. Read by `useCommandKeys`. */
export function useCommandKeysSuspended(): boolean {
  return (useContext(CommandContext)?.suspensions ?? 0) > 0;
}

/**
 * Claim the keyboard for as long as `active` is true, so no command binding fires.
 *
 * A counter rather than a flag: an inline row editor and a picker dialog can both be up, and the
 * one that closes first must not hand the keyboard back while the other still owns it.
 *
 * This is for state the DOM cannot show — an inline cell editor, a row being renamed. Dialogs do not
 * need it: they are `role="dialog"`, which `isModalOpen` already sees.
 */
export function useSuspendCommandKeys(active: boolean): void {
  const context = useContext(CommandContext);
  const suspend = context?.suspend;
  const resume = context?.resume;

  useEffect(() => {
    if (!active || !suspend || !resume) return;
    suspend();
    return resume;
  }, [active, suspend, resume]);
}

/** What a menu actually draws. Two arrays with the same signature render identically. */
function signatureOf(commands: readonly Command[]): string {
  return commands.map((command) => `${command.id}:${command.label}`).join("|");
}

/**
 * Publish this component's commands for as long as it is mounted.
 *
 * **`commands` must be memoised by the caller.** Registering sets state on the provider,
 * which re-renders this component; an array rebuilt on every render therefore re-registers
 * on every render, and the two chase each other until the tab locks up. `useMemo` at the
 * call site, with the handlers and the enabling conditions in its dependency list.
 *
 * That is the same contract `useEffect` has, but the failure is far less forgiving, so the
 * guard below turns it into a named console error instead of a hung page. It fired for real
 * on the first run of this code — through a value in `useGridTab` that had been rebuilding
 * itself every render for months, harmlessly, until something depended on its identity.
 */
export function useRegisterCommands(commands: readonly Command[]): void {
  const context = useContext(CommandContext);
  const register = context?.register;
  const unregister = context?.unregister;

  // One key per mounted caller, so two grids on one screen do not overwrite each other.
  const [key] = useState(() => nextKey++);

  const churn = useRef(initialCommandChurnState());

  useEffect(() => {
    if (!register || !unregister) return;

    if (process.env.NODE_ENV !== "production") {
      // A rapid burst of new arrays with the same rendered signature is the shape of the
      // runaway loop. This is deliberately windowed: selecting another row can legitimately
      // replace handlers without changing ids or labels, and normal interactions must not
      // accumulate into a false alarm.
      const signature = signatureOf(commands);
      const result = advanceCommandChurn(churn.current, signature, performance.now());
      churn.current = result.state;

      if (result.shouldWarn) {
        console.error(
          "useRegisterCommands: the commands array was rebuilt more than 20 times in " +
            "one second without changing shape. Wrap it in useMemo at the call site. " +
            `Commands: ${signature}`,
        );
      }
    }

    register(key, commands);
    return () => unregister(key);
  }, [key, commands, register, unregister]);
}
