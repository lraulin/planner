import { describe, expect, it } from "vitest";
import {
  clientRedirectAllowed,
  isBlockedLookupHost,
  isStaticPlannerRedirect,
  registerPublicClient,
  resolveClient,
} from "./clients";

/** The hostname the way the fetch will see it — through `URL`, which is what keeps brackets. */
function hostOf(url: string): string {
  return new URL(url).hostname;
}

describe("OAuth clients", () => {
  it("allows Grok and xAI https callbacks for the static planner client", () => {
    expect(isStaticPlannerRedirect("https://grok.com/connectors/callback")).toBe(true);
    expect(isStaticPlannerRedirect("https://accounts.x.ai/mcp/callback")).toBe(true);
    expect(isStaticPlannerRedirect("http://127.0.0.1:8787/cb")).toBe(true);
    expect(isStaticPlannerRedirect("https://evil.example/steal")).toBe(false);
  });

  it("resolves the static planner client and a registered public client", async () => {
    process.env.PLANNER_AGENT_API_KEY = "test-key";
    const staticClient = await resolveClient("planner");
    expect(staticClient?.clientName).toBe("Grok");
    expect(
      staticClient &&
        clientRedirectAllowed(staticClient, "https://grok.com/oauth/callback"),
    ).toBe(true);

    const registered = registerPublicClient("Cursor", ["https://cursor.com/callback"]);
    const resolved = await resolveClient(registered.clientId);
    expect(resolved?.clientName).toBe("Cursor");
    expect(
      resolved && clientRedirectAllowed(resolved, "https://cursor.com/callback"),
    ).toBe(true);
    expect(
      resolved && clientRedirectAllowed(resolved, "https://grok.com/callback"),
    ).toBe(false);
  });
});

describe("isBlockedLookupHost", () => {
  it("refuses loopback, private and link-local names a client_id URL could point at", () => {
    for (const url of [
      "https://localhost/c",
      "https://app.localhost/c",
      "https://0.0.0.0/c",
      "https://127.0.0.1/c",
      "https://10.1.2.3/c",
      "https://192.168.0.5/c",
      "https://172.16.0.1/c",
      "https://172.31.255.255/c",
      // The cloud metadata address.
      "https://169.254.169.254/latest/meta-data",
      // Other spellings of 127.0.0.1 that `URL` normalises before the check sees them.
      "https://2130706433/c",
      "https://0x7f.1/c",
    ]) {
      expect(isBlockedLookupHost(hostOf(url)), url).toBe(true);
    }
  });

  it("refuses the same hosts spelled so that a literal string comparison misses them", () => {
    // `URL.hostname` keeps an IPv6 literal's brackets and a rooted name's trailing dot, so
    // `=== "::1"` and `startsWith("fe80")` and `=== "localhost"` each compared against a
    // string that could never be equal.
    for (const url of [
      "https://localhost./c",
      "https://[::1]/c",
      "https://[::]/c",
      "https://[fe80::1]/c",
      "https://[fd12:3456:789a::1]/c",
      "https://[fc00::1]/c",
      // IPv4-mapped loopback and 10/8 — `URL` rewrites the dotted form to hex groups.
      "https://[::ffff:127.0.0.1]/c",
      "https://[::ffff:10.0.0.1]/c",
    ]) {
      expect(isBlockedLookupHost(hostOf(url)), url).toBe(true);
    }
  });

  it("lets an ordinary public client through", () => {
    for (const url of [
      "https://client.example.com/metadata.json",
      "https://notlocalhost.example/c",
      "https://localhostfoo.example/c",
      // The edges of 172.16/12 and the neighbouring public ranges.
      "https://172.15.0.1/c",
      "https://172.32.0.1/c",
      "https://8.8.8.8/c",
      "https://[2606:4700:4700::1111]/c",
    ]) {
      expect(isBlockedLookupHost(hostOf(url)), url).toBe(false);
    }
  });
});
