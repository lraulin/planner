"use client";

import dynamic from "next/dynamic";

/**
 * Lazy Markdown preview shell.
 *
 * `react-markdown` + `remark-gfm` are ~55 KB compressed and only needed when Preview is
 * selected. The heavy module loads on first Preview click; Edit mode never pays for it.
 */

const MarkdownPreviewBody = dynamic(
  () => import("./MarkdownPreviewBody").then((mod) => mod.MarkdownPreviewBody),
  {
    ssr: false,
    loading: () => (
      <p className="text-[0.875rem] italic text-ink-faint">Loading preview…</p>
    ),
  },
);

export function MarkdownPreview({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  const trimmed = source.trim();

  if (trimmed === "") {
    return (
      <p className={`text-[0.875rem] italic text-ink-faint ${className ?? ""}`}>
        Nothing written yet.
      </p>
    );
  }

  return (
    <div className={`md-body ${className ?? ""}`}>
      <MarkdownPreviewBody source={source} />
    </div>
  );
}
