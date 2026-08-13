"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { requestQuickCapture } from "@/components/capture/event";
import { signOut } from "@/lib/auth/client";
import { QUICK_CAPTURE } from "@/lib/commands/chords";
import { FILE_COMMAND_PLACEMENTS, FILE_MENU } from "@/lib/commands/fileCommands";
import type { Command } from "@/lib/commands/registry";
import { BUILT_MODULES, modulePages } from "./modules";

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
 *
 * **Pages are generated the same way, and for the same reason.** The palette must be complete
 * (`navigation.md`), and a module's pages are destinations — `Agenda` and `Journal` are places
 * you go, so a Go menu that stops at the module and makes you find the bar yourself is one you
 * stop trusting. `Schedule: Agenda` rather than a bare `Agenda`, because four of these labels
 * are generic on their own and `Grid` alone would be indistinguishable from a command.
 */
export function useGlobalCommands(): readonly Command[] {
  const router = useRouter();

  return useMemo(() => {
    const go: Command[] = BUILT_MODULES.flatMap((entry) => {
      const pages = modulePages(entry.id);

      const goToModule: Command = {
        id: `go.${entry.id}`,
        label: entry.label,
        group: "go",
        keywords: GO_KEYWORDS[entry.id],
        run: () => router.push(entry.href),
      };

      // A module with one page has no bar, and a second entry naming it would be the same
      // destination printed twice under two names.
      if (pages.length < 2) return [goToModule];

      return [
        goToModule,
        ...pages.map(({ page, href }) => ({
          id: `go.${entry.id}.${page.id}`,
          label: `${entry.label}: ${page.label}`,
          group: "go" as const,
          keywords: [GO_KEYWORDS[entry.id], page.keywords].filter(Boolean).join(" "),
          run: () => router.push(href),
        })),
      ];
    });

    const runs: Record<string, () => void> = {
      "app.capture": requestQuickCapture,
      "app.process-inbox": () => router.push("/organize"),
      "app.plan-week": () => router.push("/schedule/plan"),
      "app.settings": () => router.push("/settings"),
      "app.sign-out": () => {
        void signOut().then(() => {
          router.replace("/login");
          router.refresh();
        });
      },
    };

    const app: Command[] = FILE_COMMAND_PLACEMENTS.map((placement) => ({
      ...placement,
      group: "app" as const,
      menu: FILE_MENU,
      // Quick capture's binding stays here — `QuickCapture` owns a document listener with
      // the `isModalOpen` guard, which the shared dispatcher deliberately does not do.
      // Declaring it on the command is what makes File and the palette print `C`.
      bindings: placement.id === "app.capture" ? QUICK_CAPTURE : undefined,
      run: runs[placement.id] ?? (() => {}),
    }));

    /*
     * Deliberately absent: **Reset everything**. It lives on the settings page behind its own
     * confirmation and nowhere else. `ux-principles.md` puts error prevention above error
     * recovery, and an irreversible wipe two keystrokes from an empty palette is precisely
     * the accident that rule exists to stop.
     */

    return [...go, ...app];
  }, [router]);
}

/** The five File-menu verbs, identity-stable with `useGlobalCommands`. */
export function useFileCommands(): readonly Command[] {
  const all = useGlobalCommands();
  return useMemo(() => all.filter((command) => command.menu === FILE_MENU), [all]);
}

/**
 * Names the label does not carry, for the **module** entries. Achieve's own vocabulary belongs
 * here — someone reaching for "calendar" should not have to know we called it Weekly Schedule.
 *
 * A page's own terms live on its `PageEntry` in `pages.ts` and are merged in above, which is
 * where the seven Plan destinations' keywords went when they stopped being modules. What stays
 * here is deliberately broad: `plan` lists what is *inside* it, because the module label alone
 * would not match anyone typing "outline".
 */
const GO_KEYWORDS: Record<string, string> = {
  plan: "outline overview projects tasks goals wish list result areas hierarchy",
  chooser: "task chooser next action best overall urgent",
  schedule:
    "calendar week weekly time blocking appointments day today daily page franklin covey time charts",
  metrics: "measures tracking numbers graph",
  fitness: "workout exercise log",
  finances: "money accounts transactions register spending",
  notes: "note journal markdown",
  library: "reference contacts resources address book capacity",
};
