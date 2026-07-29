"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders markdown source as formatted text.
 *
 * **`rehype-raw` is deliberately absent.** Without it `react-markdown` never renders raw
 * HTML found in the source — it escapes it — which is why a note can hold a pasted
 * `<script>` tag without that being a problem, and why no sanitizer is needed here. Adding
 * `rehype-raw` would turn every note body into an XSS vector. Do not.
 *
 * Styling lives in the `.md-body` block in `globals.css` rather than on the elements here,
 * so the same rules cover this component and the markdown fields on the node forms.
 */
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
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  );
}
