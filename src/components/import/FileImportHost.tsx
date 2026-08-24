"use client";

import { useCallback, useId, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ModalShell } from "@/components/detail/ModalShell";
import { useRegisterCommands } from "@/components/shell/CommandProvider";
import { fileImportCommand } from "@/lib/commands/fileImport";

/**
 * File ▸ Import command plus the dialog that hosts the existing Settings panel.
 *
 * Pages that already have an opener (Register's New ▸ Import transactions…) use the
 * hook so both verbs share one shell. Everyone else mounts `FileImportHost`.
 */
export function useFileImportCommand(spec: {
  id: string;
  label: string;
  keywords: string;
}): {
  open: boolean;
  openImport: () => void;
  closeImport: () => void;
} {
  const [open, setOpen] = useState(false);
  const openImport = useCallback(() => setOpen(true), []);
  const closeImport = useCallback(() => setOpen(false), []);
  const commands = useMemo(
    () => [
      fileImportCommand({
        id: spec.id,
        label: spec.label,
        keywords: spec.keywords,
        run: openImport,
      }),
    ],
    [spec.id, spec.label, spec.keywords, openImport],
  );
  useRegisterCommands(commands);
  return { open, openImport, closeImport };
}

export function FileImportDialog({
  open,
  onClose,
  title,
  width = "max-w-xl",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  width?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <ModalShell open={open} onClose={onClose} labelledBy={titleId} width={width}>
      <div className="flex items-center justify-between border-b border-rule px-4 py-2.5">
        <h2
          id={titleId}
          className="text-[0.75rem] font-semibold uppercase tracking-wider text-ink-muted"
        >
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="min-h-tap px-2 text-[0.875rem] text-ink-muted md:min-h-0"
        >
          Close
        </button>
      </div>
      {children}
    </ModalShell>
  );
}

/** Register File ▸ Import and host the existing panel. Refreshes the page on close. */
export function FileImportHost({
  commandId,
  label,
  keywords,
  title,
  width,
  children,
}: {
  commandId: string;
  label: string;
  keywords: string;
  title: string;
  width?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const dialog = useFileImportCommand({ id: commandId, label, keywords });
  return (
    <FileImportDialog
      open={dialog.open}
      onClose={() => {
        dialog.closeImport();
        router.refresh();
      }}
      title={title}
      width={width}
    >
      {/*
        React evaluates children before the dialog can return null, so a closed host
        would still hydrate the import panel (Achieve XML, Tomboy, statements…). Mount
        it the first time File ▸ Import actually opens.
      */}
      {dialog.open ? children : null}
    </FileImportDialog>
  );
}
