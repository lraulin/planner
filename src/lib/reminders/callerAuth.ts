import { Receiver } from "@upstash/qstash";
import { secretsMatch } from "@/lib/agent/auth";
import { AgentError } from "@/lib/agent/errors";
import { fireCallbackUrl } from "./publish";

/**
 * Who may call the two scheduler routes. Neither has a session: QStash and Vercel Cron are
 * machines, and each proves itself its own way. Both fail closed when unconfigured.
 */

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Same comparison as the agent key
 * (`api/agent-auth.md`): hashed, timing-safe.
 */
export function requireCronSecret(request: Request): void {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    throw new AgentError("internal", "CRON_SECRET is not configured on the server");
  }
  const match = /^Bearer\s+(.+)$/i.exec(
    request.headers.get("authorization")?.trim() ?? "",
  );
  if (!match || !secretsMatch(match[1].trim(), expected)) {
    throw new AgentError("unauthorized", "Invalid cron secret");
  }
}

/**
 * QStash signs every delivery with a JWT over the body and the destination URL, using the
 * current signing key or — during a rotation — the next one. Verifying it means only QStash
 * can fire a reminder; there is no shared key to hand out or leak.
 *
 * The URL is checked against the one we publish to, so a message signed for some other
 * endpoint cannot be replayed here.
 */
export async function requireQStashSignature(
  request: Request,
  body: string,
): Promise<void> {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY?.trim();
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY?.trim();
  if (!currentSigningKey || !nextSigningKey) {
    throw new AgentError(
      "internal",
      "QStash signing keys are not configured on the server",
    );
  }
  const signature = request.headers.get("upstash-signature");
  if (!signature) throw new AgentError("unauthorized", "Missing Upstash-Signature");

  const receiver = new Receiver({ currentSigningKey, nextSigningKey });
  try {
    const valid = await receiver.verify({
      signature,
      body,
      url: fireCallbackUrl(),
      clockTolerance: 30,
    });
    if (!valid) throw new Error("invalid");
  } catch {
    throw new AgentError("unauthorized", "Invalid Upstash-Signature");
  }
}
