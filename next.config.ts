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
  // Achieve Full XML dumps are often multi-MB (schema + years of data). Import passes the
  // file body through a Server Action; the default 1 MB cap rejects those before our own
  // 25 MB guard in importAchieveXmlAction can run.
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
