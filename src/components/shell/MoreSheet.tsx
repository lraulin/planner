"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { ModalShell } from "@/components/detail/ModalShell";
import { MoreIcon } from "./navIcons";
import { TABS, type TabId } from "./tabs";

/**
 * The rest of the app, one tap below the bottom nav.
 *
 * The bar has five slots and the app has ten views plus Settings and Sign out, so seven of
 * them live here. Built on `ModalShell` per `modal-pattern.md`, which renders it as a bottom
 * sheet below `md` — the list lands under the thumb rather than in the middle of the screen.
 */
export function MoreSheet({ active }: { active: TabId }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  const secondary = TABS.filter((tab) => !tab.primary);
  const isActiveSection = secondary.some((tab) => tab.id === active);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className={`flex min-h-tap flex-1 flex-col items-center justify-center gap-0.5 py-1.5 ${
          isActiveSection ? "text-ink" : "text-ink-muted"
        }`}
      >
        <MoreIcon />
        <span className="text-[0.625rem] leading-none">More</span>
      </button>

      <ModalShell
        open={open}
        onClose={() => setOpen(false)}
        labelledBy={titleId}
        width="max-w-sm"
      >
        <div className="p-2">
          <h2
            id={titleId}
            className="px-3 py-2 text-[0.8125rem] font-semibold text-ink-muted"
          >
            All views
          </h2>

          <nav aria-label="More views">
            {secondary.map((tab) => (
              <Link
                key={tab.id}
                href={tab.href}
                onClick={() => setOpen(false)}
                aria-current={tab.id === active ? "page" : undefined}
                className={`flex min-h-tap items-center rounded px-3 text-[0.9375rem] ${
                  tab.id === active ? "bg-select font-medium text-ink" : "text-ink"
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </nav>

          <div className="mt-2 flex items-center justify-between border-t border-rule px-3 pt-2">
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex min-h-tap items-center text-[0.9375rem] text-ink"
            >
              Settings
            </Link>
            <LogoutButton />
          </div>
        </div>
      </ModalShell>
    </>
  );
}
