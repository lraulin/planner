import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Compare two secrets without letting the time taken say how much of the first one matched.
 *
 * `===` on strings stops at the first differing byte, so how long it takes is a function of
 * the shared prefix. That matters for every Bearer secret on a public URL: the agent key
 * guards a write surface (`/api/agent/*`, `/api/mcp`) and `CRON_SECRET` guards the routes
 * that spend the SimpleFIN request quota and rewrite the calendar mirror.
 *
 * Hashed first rather than compared directly: `timingSafeEqual` throws on unequal lengths, so
 * feeding it the raw values would need a length check that is itself an early return. SHA-256
 * makes both sides 32 bytes whatever was sent, so the secret's length leaks nothing either.
 */
export function secretsMatch(a: string, b: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
}
