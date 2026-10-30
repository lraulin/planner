import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const originalSecret = process.env.CRON_SECRET;

function call(job: string, authorization?: string) {
  return GET(
    new Request(`http://localhost/api/cron/${job}`, {
      headers: authorization === undefined ? {} : { authorization },
    }),
    { params: Promise.resolve({ job }) },
  );
}

beforeEach(() => {
  process.env.CRON_SECRET = "route-test-secret";
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

// The authorised paths run real syncs against the network; `jobs.integration.test.ts`
// covers them with the syncs injected. This file pins the gate in front of them.
describe("cron route gate", () => {
  it("refuses an unauthenticated or wrongly authenticated call before running anything", async () => {
    for (const header of [undefined, "Bearer wrong", "route-test-secret"]) {
      const response = await call("bank-sync", header);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ ok: false, error: "Unauthorized" });
    }
  });

  it("fails closed with a server error when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const response = await call("calendar-sync", "Bearer ");
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ ok: false });
  });

  it("answers 404 for an unknown job only once authenticated", async () => {
    expect((await call("drop-tables")).status).toBe(401);
    const response = await call("drop-tables", "Bearer route-test-secret");
    expect(response.status).toBe(404);
  });
});
