import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyS256 } from "./pkce";

describe("PKCE S256", () => {
  it("accepts the matching verifier and rejects a wrong one", () => {
    const verifier = "a".repeat(43);
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    expect(verifyS256(verifier, challenge)).toBe(true);
    expect(verifyS256("b".repeat(43), challenge)).toBe(false);
  });
});
