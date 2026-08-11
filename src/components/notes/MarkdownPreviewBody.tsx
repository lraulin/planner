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
 * Loaded only via `MarkdownPreview`'s dynamic import so the Notes route does not ship the
 * parser until Preview is selected.
 */
export function MarkdownPreviewBody({ source }: { source: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>;
}
