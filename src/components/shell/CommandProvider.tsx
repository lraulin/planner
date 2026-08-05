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
};

const CommandContext = createContext<CommandContextValue | null>(null);

let nextKey = 0;

export function CommandProvider({ children }: { children: React.ReactNode }) {
  const [registrations, setRegistrations] = useState<Registration[]>([]);

  const register = useCallback((key: number, commands: readonly Command[]) => {
    setRegistrations((current) => {
      const rest = current.filter((entry) => entry.key !== key);
      return [...rest, { key, commands }];
    });
  }, []);

  const unregister = useCallback((key: number) => {
    setRegistrations((current) => current.filter((entry) => entry.key !== key));
  }, []);

  const commands = useMemo(
    () => registrations.flatMap((entry) => entry.commands),
    [registrations],
  );

  const value = useMemo(
    () => ({ commands, register, unregister }),
    [commands, register, unregister],
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

  const churn = useRef({ signature: "", count: 0, warned: false });

  useEffect(() => {
    if (!register || !unregister) return;

    if (process.env.NODE_ENV !== "production") {
      // A new array whose rendered signature is identical means the caller rebuilt it
      // without anything changing — the exact shape of the runaway loop.
      const signature = signatureOf(commands);
      const state = churn.current;
      state.count = signature === state.signature ? state.count + 1 : 0;
      state.signature = signature;

      if (state.count > 20 && !state.warned) {
        state.warned = true;
        console.error(
          "useRegisterCommands: the commands array is being rebuilt on every render, " +
            "which re-registers on every render. Wrap it in useMemo at the call site. " +
            `Commands: ${signature}`,
        );
      }
    }

    register(key, commands);
    return () => unregister(key);
  }, [key, commands, register, unregister]);
}
