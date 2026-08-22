import { describe, expect, it } from "vitest";
import { generateInviteToken, inviteSignupUrl } from "./invites";

describe("inviteSignupUrl", () => {
  it("puts the token on /signup against the auth origin, not an alias", () => {
    expect(inviteSignupUrl("abc+def", "https://planner-lee-5344.vercel.app/")).toBe(
      "https://planner-lee-5344.vercel.app/signup?invite=abc%2Bdef",
    );
  });

  it("defaults to localhost when BETTER_AUTH_URL is unset in the argument", () => {
    expect(inviteSignupUrl("tok", "http://localhost:3047")).toBe(
      "http://localhost:3047/signup?invite=tok",
    );
  });
});

describe("generateInviteToken", () => {
  it("is long enough that guessing one is not a realistic attack", () => {
    const token = generateInviteToken();
    // 32 bytes, base64url, no padding.
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(token).not.toMatch(/[+/=]/);
  });
});
