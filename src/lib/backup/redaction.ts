const CONNECTION_URL = /postgres(?:ql)?:\/\/[^\s'"<>]+/giu;

export function redactSecrets(text: string, secrets: readonly string[]): string {
  let redacted = text.replace(CONNECTION_URL, "[REDACTED_DATABASE_URL]");
  for (const secret of secrets) {
    if (!secret) continue;
    redacted = redacted.replaceAll(secret, "[REDACTED]");
    const encoded = encodeURIComponent(secret);
    if (encoded !== secret) redacted = redacted.replaceAll(encoded, "[REDACTED]");
  }
  return redacted;
}
