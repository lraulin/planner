"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { requestQuickCapture } from "@/components/capture/event";
import { signOut } from "@/lib/auth/client";
import type { Command } from "@/lib/commands/registry";
import { BUILT_MODULES } from "./modules";

/**
 * The commands that mean the same thing on every screen.
 *
 * The `go` half is generated from the module registry rather than written out, so a new module
 * becomes reachable by `⌘K` the moment it is added — this is Achieve's Go menu, and the
 * manual's promise that it lists *all* the tabs is only true if nobody has to remember to
 * add one here.
 *
 * Modules marked `reserved` are excluded by `BUILT_MODULES`. A palette entry that 404s is
 * worse than a missing one.
 */
export function useGlobalCommands(): readonly Command[] {
  const router = useRouter();

  return useMemo(() => {
    const go: Command[] = BUILT_MODULES.map((entry) => ({
      id: `go.${entry.id}`,
      label: entry.label,
      group: "go",
      keywords: GO_KEYWORDS[entry.id],
      run: () => router.push(entry.href),
    }));

    const app: Command[] = [
      {
        id: "app.capture",
        label: "Quick capture",
        group: "app",
        // The binding stays where it is — `QuickCapture` owns a document listener with the
        // `isModalOpen` guard, which the shared dispatcher deliberately does not do. Declaring it
        // here is what makes the palette print `C`, and `bindings.ts` is what makes the printed
        // string and that listener agree on which key it is.
        bindings: [{ key: "c" }],
        keywords: "new task inbox add",
        run: requestQuickCapture,
      },
      {
        id: "app.plan-week",
        label: "Plan Week…",
        group: "app",
        keywords: "weekly planning wizard",
        run: () => router.push("/schedule/plan"),
      },
      {
        /*
         * One entry, not five. The import and export panels (Achieve transfer, RedNotebook,
         * Tomboy, Google Calendar) all live on this page and none has a stable anchor to
         * deep-link to — their headings use `useId`. Keywords make them findable; the page
         * is where they are.
         */
        id: "app.settings",
        label: "Settings",
        group: "app",
        keywords:
          "options preferences import export achieve rednotebook tomboy google calendar reset backup",
        run: () => router.push("/settings"),
      },
      {
        id: "app.sign-out",
        label: "Sign out",
        group: "app",
        run: () => {
          void signOut().then(() => {
            router.replace("/login");
            router.refresh();
          });
        },
      },
    ];

    /*
     * Deliberately absent: **Reset everything**. It lives on the settings page behind its own
     * confirmation and nowhere else. `ux-principles.md` puts error prevention above error
     * recovery, and an irreversible wipe two keystrokes from an empty palette is precisely
     * the accident that rule exists to stop.
     */

    return [...go, ...app];
  }, [router]);
}

/**
 * Names the label does not carry. Achieve's own vocabulary belongs here — someone reaching
 * for "calendar" should not have to know we called it Weekly Schedule.
 */
const GO_KEYWORDS: Record<string, string> = {
  outline: "tree result areas dreams hierarchy",
  "result-areas": "result area roles life dimensions importance weighting",
  projects: "project list",
  tasks: "task list todo",
  goals: "goal dreams objectives",
  wishes: "wish list someday maybe",
  day: "today daily page franklin covey",
  chooser: "task chooser next action best overall urgent",
  schedule: "calendar week weekly time blocking appointments",
  metrics: "measures tracking numbers graph",
  fitness: "workout exercise log",
  notes: "note journal markdown",
  "time-charts": "time chart ideal week template background blocks",
  resources: "capacity availability workload hours overhead effectiveness team",
  contacts: "people address book phone email rolodex who discussion items",
};
