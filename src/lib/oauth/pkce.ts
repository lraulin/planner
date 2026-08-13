import { createHash, timingSafeEqual } from "node:crypto";

export function verifyS256(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false;
  const digest = createHash("sha256").update(verifier).digest("base64url");
  const a = Buffer.from(digest);
  const b = Buffer.from(challenge);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
