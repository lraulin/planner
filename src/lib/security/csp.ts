/**
 * The Content Security Policy this app sends, and the reasoning behind each concession.
 *
 * A CSP is the one control that still helps *after* an XSS bug exists: session cookies are
 * `httpOnly`, so injected script cannot read them, but without a CSP it can still act as
 * the signed-in user through same-origin fetches. That is the whole finance register.
 *
 * Pure by design — it takes a nonce and a flag rather than reading `process.env`, so
 * `src/lib` stays unaware that it is in a web app (`development/clean-code.md`) and the
 * dev/production policies are both testable without touching the environment.
 */

export type CspOptions = {
  /** Per-request, unguessable. A reused nonce is the same as no nonce at all. */
  nonce: string;
  /** Development gets two concessions that must never reach production. */
  isDev: boolean;
};

/**
 * Build the policy string.
 *
 * Two directives are deliberately *not* what a first pass would write, and both will look
 * like mistakes to the next person:
 *
 * **`style-src` carries `'unsafe-inline'` and no nonce.** `style-src` governs `style="…"`
 * attributes, not only `<style>` tags, and FullCalendar positions every event in the
 * schedule with an inline style attribute — as do the ~20 `style={{…}}` props elsewhere. A
 * strict `style-src` renders the calendar with every event stacked at the origin. Adding a
 * nonce here would be actively worse than useless: a nonce present in a directive makes
 * browsers *ignore* `'unsafe-inline'` in that same directive, so it would break the
 * calendar while looking stricter. Styles are a far weaker injection vector than scripts,
 * which is where this trade is worth making.
 *
 * **`script-src` keeps `'self'` even though `'strict-dynamic'` makes CSP3 browsers ignore
 * it.** It is the fallback for CSP2-era browsers, and is what the Next.js documentation
 * prescribes. Not redundant.
 */
export function buildCsp({ nonce, isDev }: CspOptions): string {
  const directives = [
    "default-src 'self'",

    // 'strict-dynamic' lets the nonced Next.js bootstrap load the rest of the bundle
    // graph without every chunk needing its own nonce. 'unsafe-eval' is required in
    // development only, where React uses eval to rebuild server stacks in the browser;
    // neither React nor Next.js evals in a production build.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,

    // See the doc comment. No nonce here, on purpose.
    "style-src 'self' 'unsafe-inline'",

    "img-src 'self' blob: data:",
    "font-src 'self'",

    // Dev only: Next's HMR client opens a websocket back to the same origin, and browsers
    // have historically been inconsistent about whether 'self' covers a ws: scheme.
    //
    // Still `'self'` and nothing more. The bank sync was briefly built on a provider whose
    // widget ran in the page and needed two extra origins here plus a `frame-src`; the
    // provider that shipped talks to its server from ours, so the page loads no third-party
    // script and frames nothing. Anything proposing to widen this again should be weighed
    // against that — it was reverted once because it turned out not to be necessary.
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,

    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",

    // The clickjacking control. X-Frame-Options in next.config.ts says the same thing for
    // anything that predates frame-ancestors.
    "frame-ancestors 'none'",
  ];

  // Only in production: locally the app is served over http://localhost:3047, and this
  // would rewrite those requests to https and break the dev server.
  if (!isDev) directives.push("upgrade-insecure-requests");

  return directives.join("; ") + ";";
}

/**
 * A fresh nonce for one request.
 *
 * `randomUUID` is CSPRNG-backed and available in the edge runtime, where `node:crypto` is
 * not. Base64 keeps it compact and inside the CSP token grammar.
 */
export function createNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}
