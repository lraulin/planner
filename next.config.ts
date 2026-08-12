import type { NextConfig } from "next";

/**
 * Security headers that need no per-request value. The Content-Security-Policy is *not*
 * here — it carries a per-request nonce, so it is set in `src/proxy.ts`.
 *
 * `Strict-Transport-Security` is deliberately absent. Vercel already sends
 * `max-age=63072000; includeSubDomains; preload` on `.vercel.app`, and that domain is on
 * the browser preload list; setting our own would risk overriding a preload-qualified
 * value with a weaker one.
 */
const securityHeaders = [
  // Stop the browser from second-guessing a Content-Type — the classic way a stored file
  // becomes executable script.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Belt and braces with `frame-ancestors 'none'` in the CSP, for anything older than CSP2.
  { key: "X-Frame-Options", value: "DENY" },
  // Send the full URL only to ourselves; bare origin cross-site. Register URLs should not
  // travel in a Referer header.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing here needs any of these; denying them costs nothing and shrinks the surface a
  // successful injection could reach for.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  // Import routes accept up to 25 MB (Achieve Full XML, a folder of 360 statements).
  // Two Next.js caps sit in front of those guards and must be at least as large, or
  // the request never reaches our JSON error:
  //
  // - serverActions.bodySizeLimit (default 1 MB) — leftover Server Action imports.
  // - proxyClientMaxBodySize (default 10 MB) — `proxy.ts` clones every body so the
  //   route can still read it. Above the cap Next truncates; `formData()` then throws
  //   and the client sees `Unexpected token 'R', "Request En"...` from a 413 page.
  //   30 MB is a little above 25 MB so the application guard fires first.
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
    proxyClientMaxBodySize: "30mb",
  },
  headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
