"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { requestQuickCapture } from "@/components/capture/event";
import { signOut } from "@/lib/auth/client";
import type { Command } from "@/lib/commands/registry";
import { BUILT_VIEWS } from "./views";

/**
 * The commands that mean the same thing on every screen.
 *
 * The `go` half is generated from the view registry rather than written out, so a new view
 * becomes reachable by `⌘K` the moment it is added — this is Achieve's Go menu, and the
 * manual's promise that it lists *all* the tabs is only true if nobody has to remember to
 * add one here.
 *
 * Views marked `reserved` are excluded by `BUILT_VIEWS`. A palette entry that 404s is worse
 * than a missing one.
 */
export function useGlobalCommands(): readonly Command[] {
  const router = useRouter();

  return useMemo(() => {
    const go: Command[] = BUILT_VIEWS.map((view) => ({
      id: `go.${view.id}`,
      label: view.label,
      group: "go",
      keywords: GO_KEYWORDS[view.id],
      run: () => router.push(view.href),
    }));

    const app: Command[] = [
      {
        id: "app.capture",
        label: "Quick capture",
        group: "app",
        shortcut: "c",
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
         * One entry, not four. The import and export panels (Achieve transfer, RedNotebook,
         * Google Calendar) all live on this page and none has a stable anchor to deep-link
         * to — their headings use `useId`. Keywords make them findable; the page is where
         * they are.
         */
        id: "app.settings",
        label: "Settings",
        group: "app",
        keywords:
          "options preferences import export achieve rednotebook google calendar reset backup",
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
};
