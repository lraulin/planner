import { describe, expect, it } from "vitest";
import { cronAuthorization } from "./auth";

const SECRET = "a-long-random-cron-secret";

function request(authorization?: string): Request {
  return new Request("http://localhost/api/cron/bank-sync", {
    headers: authorization === undefined ? {} : { authorization },
  });
}

describe("cronAuthorization", () => {
  it("accepts the configured secret as a Bearer token", () => {
    expect(cronAuthorization(request(`Bearer ${SECRET}`), SECRET)).toBe("ok");
    expect(cronAuthorization(request(`bearer   ${SECRET}  `), SECRET)).toBe("ok");
  });

  it("fails closed when no secret is configured, even for an empty Bearer token", () => {
    expect(cronAuthorization(request("Bearer "), undefined)).toBe("unconfigured");
    expect(cronAuthorization(request("Bearer anything"), "")).toBe("unconfigured");
    expect(cronAuthorization(request("Bearer    "), "   ")).toBe("unconfigured");
  });

  it("rejects a missing header, another scheme, or the wrong secret", () => {
    expect(cronAuthorization(request(), SECRET)).toBe("unauthorized");
    expect(cronAuthorization(request(SECRET), SECRET)).toBe("unauthorized");
    expect(cronAuthorization(request(`Basic ${SECRET}`), SECRET)).toBe("unauthorized");
    expect(cronAuthorization(request(`Bearer ${SECRET}x`), SECRET)).toBe(
      "unauthorized",
    );
    expect(cronAuthorization(request(`Bearer ${SECRET.slice(0, -1)}`), SECRET)).toBe(
      "unauthorized",
    );
  });
});
