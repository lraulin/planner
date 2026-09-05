import { describe, expect, it } from "vitest";

import { redactSecrets } from "./redaction";

describe("redactSecrets", () => {
  it("removes literal and URL-encoded secrets plus PostgreSQL URLs", () => {
    const passphrase = "secret with/slash";
    const output = redactSecrets(
      `password=${passphrase} encoded=${encodeURIComponent(passphrase)} postgresql://lee:pw@example.test/db`,
      [passphrase],
    );

    expect(output).not.toContain("secret");
    expect(output).not.toContain("lee:pw");
    expect(output).toContain("[REDACTED]");
    expect(output).toContain("[REDACTED_DATABASE_URL]");
  });
});
