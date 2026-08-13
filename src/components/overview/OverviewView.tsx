"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { requestQuickCapture } from "@/components/capture/event";
import { DestinationCommandBar } from "@/components/grid/DestinationCommandBar";
import { MasterContextsDialog } from "@/components/contexts/MasterContextsDialog";
import { ProjectPickerDialog } from "@/components/projects/ProjectPickerDialog";
import type { ProjectPickerValue } from "@/components/projects/ProjectPicker";
import type { MasterContextOption } from "@/lib/contexts/queries";
import type { OutlineNode } from "@/lib/tree/types";

type Action =
  | { label: string; href: string; count?: number }
  | { label: string; command: "capture" | "projects" | "contexts" };

const STEP_STYLES = [
  "border-priority-b/55 text-priority-b",
  "border-select-edge/55 text-select-edge",
  "border-priority-a/50 text-priority-a",
  "border-priority-c/55 text-priority-c",
  "border-priority-d/55 text-priority-d",
];

export function OverviewView({
  nodes,
  inboxCount,
  masterContexts,
}: {
  nodes: readonly OutlineNode[];
  inboxCount: number;
  masterContexts: readonly MasterContextOption[];
}) {
  const router = useRouter();
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [contextsOpen, setContextsOpen] = useState(false);

  const steps: { phase: string; prompt: string; actions: Action[] }[] = [
    {
      phase: "Capture",
      prompt: "What has your attention?",
      actions: [
        { label: "Define Projects / Tasks", href: "/plan/outline" },
        { label: "Quick Task Entry", command: "capture" },
      ],
    },
    {
      phase: "Organize",
      prompt: "What is it, and where does it belong?",
      actions: [
        { label: "Organize Projects", href: "/plan/projects" },
        { label: "Organize Tasks", command: "projects" },
        { label: "New Task Organizer", href: "/organize", count: inboxCount },
        { label: "Define Contexts", command: "contexts" },
      ],
    },
    {
      phase: "Prioritize",
      prompt: "What matters most?",
      actions: [
        { label: "Review / Prioritize Projects", href: "/plan/projects" },
        { label: "Prioritize Tasks", command: "projects" },
        { label: "Outline", href: "/plan/outline" },
      ],
    },
    {
      phase: "Plan",
      prompt: "When will you do it?",
      actions: [
        { label: "Weekly Planning Wizard", href: "/schedule/plan" },
        { label: "Weekly Schedule", href: "/schedule" },
        { label: "Outline", href: "/plan/outline" },
      ],
    },
    {
      phase: "Do",
      prompt: "What is the best next action?",
      actions: [
        { label: "Specific Project", command: "projects" },
        { label: "Task Chooser", href: "/chooser" },
        { label: "Outline", href: "/plan/outline" },
      ],
    },
  ];

  function run(action: Extract<Action, { command: string }>) {
    if (action.command === "capture") requestQuickCapture();
    if (action.command === "projects") setProjectPickerOpen(true);
    if (action.command === "contexts") setContextsOpen(true);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DestinationCommandBar overflowLabel="More commands for Overview" />
      <div className="min-h-0 flex-1 overflow-y-auto bg-surface px-4 py-6 sm:px-6 md:px-8 md:py-9">
        <main className="mx-auto max-w-[76rem]">
          <div className="flex flex-col gap-2 border-b border-rule pb-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-ink-faint">
                The weekly operating loop
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-[-0.035em] text-ink md:text-3xl">
                Productivity Process
              </h1>
            </div>
            <p className="max-w-lg text-[0.875rem] leading-6 text-ink-muted">
              Turn what has your attention into clear work, put it in time, then choose
              what to do with confidence.
            </p>
          </div>

          <div className="relative mt-7 grid gap-4 md:grid-cols-5 md:gap-3">
            <div
              aria-hidden
              className="absolute left-[10%] right-[10%] top-6 hidden h-px bg-rule-strong md:block"
            />
            {steps.map((step, index) => (
              <section
                key={step.phase}
                className="relative grid grid-cols-[3.5rem_1fr] gap-3 md:block"
              >
                <div className="relative z-10 flex justify-center md:mb-4">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-full border-2 bg-surface font-mono text-sm font-semibold shadow-[var(--elev-1)] ${STEP_STYLES[index]}`}
                  >
                    {index + 1}
                  </div>
                </div>
                <div className="rounded-lg border border-rule bg-surface-raised/45 p-4 md:min-h-72">
                  <h2 className="text-[0.9375rem] font-semibold tracking-tight text-ink">
                    {step.phase}
                  </h2>
                  <p className="mt-1 min-h-10 text-[0.75rem] leading-5 text-ink-muted">
                    {step.prompt}
                  </p>
                  <div className="mt-4 border-t border-rule pt-2">
                    {step.actions.map((action) => {
                      const className =
                        "flex min-h-9 w-full items-center justify-between gap-2 border-b border-rule/70 py-1.5 text-left text-[0.8125rem] font-medium text-select-edge last:border-b-0 hover:text-ink";
                      const badge =
                        "count" in action && action.count != null ? (
                          <span className="tabular rounded-full bg-priority-a/12 px-2 py-0.5 font-mono text-[0.75rem] font-semibold text-priority-a">
                            {action.count}
                          </span>
                        ) : null;
                      return "href" in action ? (
                        <Link
                          key={action.label}
                          href={action.href}
                          className={className}
                        >
                          <span>{action.label}</span>
                          {badge}
                        </Link>
                      ) : (
                        <button
                          key={action.label}
                          type="button"
                          onClick={() => run(action)}
                          className={className}
                        >
                          <span>{action.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            ))}
          </div>
        </main>

        <ProjectPickerDialog
          open={projectPickerOpen}
          nodes={nodes}
          value={{ kind: "all" }}
          allowAll
          onCancel={() => setProjectPickerOpen(false)}
          onConfirm={(value: ProjectPickerValue) => {
            setProjectPickerOpen(false);
            if (value.kind === "node") {
              router.push(`/tasks?scope=${value.nodeId}`);
              return;
            }
            if (value.kind === "all") router.push("/plan/tasks");
          }}
        />
        <MasterContextsDialog
          open={contextsOpen}
          initialContexts={masterContexts}
          onClose={() => setContextsOpen(false)}
        />
      </div>
    </div>
  );
}
