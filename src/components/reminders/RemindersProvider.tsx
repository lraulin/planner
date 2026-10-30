"use client";

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { listRemindersAction, type PanelReminder } from "@/app/reminderActions";
import type { Command } from "@/lib/commands/registry";
import { useRegisterCommands } from "@/components/shell/CommandProvider";
import { registerServiceWorker } from "./pushClient";

/**
 * The Reminders panel's state, shared by the bell (desktop menu bar, phone header), the
 * `View ▸ Reminders` command and the panel itself.
 *
 * The list is fetched by the client rather than by the shell's server render: the shell
 * outlives navigations, so one read on mount plus a refresh when it matters costs nothing per
 * page — and a badge read inside every page render would add a round trip to all of them
 * (`read-latency.md`).
 *
 * It refreshes when the service worker says a push arrived, when the window regains focus
 * (the phone app coming back from the background), and when the panel opens.
 */

type RemindersContextValue = {
  reminders: PanelReminder[];
  loaded: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  refresh: () => Promise<void>;
  /** Drop a row at once, before the server confirms, so the panel answers the tap. */
  remove: (id: string) => void;
  removeAll: () => void;
};

const RemindersContext = createContext<RemindersContextValue | null>(null);

export function useReminders(): RemindersContextValue {
  const context = useContext(RemindersContext);
  if (!context) throw new Error("useReminders must be used inside RemindersProvider");
  return context;
}

export const REMINDERS_PARAM = "reminders";

export function RemindersProvider({ children }: { children: ReactNode }) {
  const [reminders, setReminders] = useState<PanelReminder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpenState] = useState(false);

  const apply = useCallback(
    (result: Awaited<ReturnType<typeof listRemindersAction>>) => {
      if (result.ok) {
        setReminders(result.data);
        setLoaded(true);
      }
    },
    [],
  );
  const refresh = useCallback(() => listRemindersAction().then(apply), [apply]);

  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      if (next) void refresh();
    },
    [refresh],
  );

  const remove = useCallback((id: string) => {
    setReminders((current) => current.filter((reminder) => reminder.id !== id));
  }, []);
  const removeAll = useCallback(() => setReminders([]), []);

  useEffect(() => {
    void registerServiceWorker();
    void listRemindersAction().then(apply);

    function onMessage(event: MessageEvent) {
      const type = (event.data as { type?: unknown } | null)?.type;
      if (type === "reminders:refresh") void refresh();
      if (type === "reminders:open") setOpen(true);
    }
    function onVisible() {
      if (document.visibilityState === "visible") void refresh();
    }

    navigator.serviceWorker?.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      navigator.serviceWorker?.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [apply, refresh, setOpen]);

  const command = useMemo<Command[]>(
    () => [
      {
        id: "view.reminders",
        label: "Reminders",
        group: "view",
        menu: "view",
        section: "Panels",
        icon: "reminders",
        keywords: "notifications alerts bell snooze due",
        title: "What has come due — Achieve's Reminders window",
        run: () => setOpen(true),
      },
    ],
    [setOpen],
  );
  useRegisterCommands(command);

  const value = useMemo(
    () => ({ reminders, loaded, open, setOpen, refresh, remove, removeAll }),
    [reminders, loaded, open, setOpen, refresh, remove, removeAll],
  );

  return (
    <RemindersContext.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        <OpenFromQuery setOpen={setOpen} />
      </Suspense>
    </RemindersContext.Provider>
  );
}

/**
 * `?reminders=open` on any shell route opens the panel — where a tapped notification lands —
 * and is then taken back out of the address bar, so a reload does not reopen it.
 *
 * Its own component, behind its own Suspense boundary, so `useSearchParams` cannot suspend
 * the whole shell.
 */
function OpenFromQuery({ setOpen }: { setOpen: (open: boolean) => void }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const requested = params.get(REMINDERS_PARAM) === "open";

  useEffect(() => {
    if (!requested) return;
    setOpen(true);
    const rest = new URLSearchParams(params.toString());
    rest.delete(REMINDERS_PARAM);
    const search = rest.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  }, [requested, params, pathname, router, setOpen]);

  return null;
}
