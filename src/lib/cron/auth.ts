import { secretsMatch } from "@/lib/security/secretsMatch";

export type CronAuthorization = "ok" | "unconfigured" | "unauthorized";

/**
 * Whether a request may run a scheduled job.
 *
 * Vercel sends the project's `CRON_SECRET` as `Authorization: Bearer <secret>` on every cron
 * invocation, and the routes sit outside the session gate in `src/proxy.ts` (a cron cannot
 * log in, and does not follow the redirect to `/login`), so this check is all that stands
 * between the public URL and a job that spends the SimpleFIN request quota.
 *
 * Fails closed: with no secret configured nothing is authorised, rather than everything.
 * `unconfigured` is reported separately so the route can answer 500 — a deploy that forgot
 * the variable is a server fault, and Vercel's cron log should say so rather than 401.
 *
 * The expected value is a parameter, not read here, so the tests do not depend on whatever
 * `.env.local` happens to set.
 */
export function cronAuthorization(
  request: Request,
  secret: string | undefined,
): CronAuthorization {
  const expected = secret?.trim();
  if (!expected) return "unconfigured";

  const header = request.headers.get("authorization")?.trim();
  const match = header ? /^Bearer\s+(.+)$/i.exec(header) : null;
  if (!match) return "unauthorized";

  return secretsMatch(match[1].trim(), expected) ? "ok" : "unauthorized";
}
