import { describe, expect, it } from "vitest";
import { buildCsp, createNonce } from "./csp";

/**
 * These tests exist for four specific mistakes, each of which produces a policy that looks
 * correct in review and fails somewhere else:
 *
 * 1. A nonce added to `style-src` — reads as "stricter", silently disables
 *    `'unsafe-inline'`, and breaks the schedule calendar.
 * 2. `'unsafe-eval'` surviving into production — quietly re-opens the hole the CSP is for.
 * 3. `upgrade-insecure-requests` in development — breaks http://localhost:3047 entirely.
 * 4. A nonce that does not change per request — equivalent to no nonce at all.
 */

const prod = (nonce = "n0nce") => buildCsp({ nonce, isDev: false });
const dev = (nonce = "n0nce") => buildCsp({ nonce, isDev: true });

/** Pull one directive out of the policy so assertions cannot match across boundaries. */
function directive(policy: string, name: string): string {
  const found = policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
  if (!found) throw new Error(`No "${name}" directive in: ${policy}`);
  return found;
}

describe("buildCsp", () => {
  it("nonces scripts and lets strict-dynamic carry the rest of the bundle", () => {
    const scriptSrc = directive(prod("abc123"), "script-src");
    expect(scriptSrc).toContain("'nonce-abc123'");
    expect(scriptSrc).toContain("'strict-dynamic'");
    // Kept for CSP2 browsers, which do not understand strict-dynamic.
    expect(scriptSrc).toContain("'self'");
  });

  it("never puts a nonce in style-src, which would disable unsafe-inline there", () => {
    for (const policy of [prod("abc123"), dev("abc123")]) {
      const styleSrc = directive(policy, "style-src");
      expect(styleSrc).toContain("'unsafe-inline'");
      expect(styleSrc).not.toContain("nonce");
    }
  });

  it("keeps unsafe-eval out of production and unsafe-inline out of production scripts", () => {
    const policy = prod();
    expect(policy).not.toContain("'unsafe-eval'");
    expect(directive(policy, "script-src")).not.toContain("'unsafe-inline'");
  });

  it("allows unsafe-eval in development, where React evals to rebuild server stacks", () => {
    expect(directive(dev(), "script-src")).toContain("'unsafe-eval'");
  });

  it("upgrades insecure requests only in production, so localhost still serves over http", () => {
    expect(prod()).toContain("upgrade-insecure-requests");
    expect(dev()).not.toContain("upgrade-insecure-requests");
  });

  it("allows the HMR websocket in development only", () => {
    expect(directive(dev(), "connect-src")).toContain("ws:");
    expect(directive(prod(), "connect-src")).not.toContain("ws:");
  });

  it("refuses framing and plugins, and pins base and form targets", () => {
    const policy = prod();
    expect(directive(policy, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(policy, "object-src")).toBe("object-src 'none'");
    expect(directive(policy, "base-uri")).toBe("base-uri 'self'");
    expect(directive(policy, "form-action")).toBe("form-action 'self'");
    expect(directive(policy, "default-src")).toBe("default-src 'self'");
  });
});

describe("createNonce", () => {
  it("returns a different value every call", () => {
    const nonces = new Set(Array.from({ length: 100 }, createNonce));
    expect(nonces.size).toBe(100);
  });

  it("stays inside the CSP token grammar, so the policy cannot be broken out of", () => {
    for (let i = 0; i < 50; i++) {
      // base64 only; notably no ';' or quote that would terminate the directive.
      expect(createNonce()).toMatch(/^[A-Za-z0-9+/]+=*$/);
    }
  });
});
