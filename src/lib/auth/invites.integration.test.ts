import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { nodes, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { loadOutline } from "@/lib/tree/queries";
import {
  createInvite,
  isInviteRedeemable,
  listInvites,
  redeemInvite,
  revokeInvite,
} from "./invites";
import { createCredentialUser, upsertUser } from "./provision";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("invites");

const createdUserIds: string[] = [];
const PASSWORD = "password12345678";

function freshEmail(label: string): string {
  return `invite-${label}-${crypto.randomUUID()}@example.com`;
}

async function provisioned(): Promise<string> {
  const result = await upsertUser({
    email: freshEmail("minter"),
    password: PASSWORD,
  });
  createdUserIds.push(result.id);
  return result.id;
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describeDb("createInvite / listInvites / revokeInvite", () => {
  it("lets a CLI-provisioned account mint a reusable link", async () => {
    const userId = await provisioned();
    const invite = await createInvite(userId);

    expect(invite.token.length).toBeGreaterThanOrEqual(43);
    expect(invite.revokedAt).toBeNull();
    expect(invite.useCount).toBe(0);
    expect(invite.url).toContain(`/signup?invite=${encodeURIComponent(invite.token)}`);

    const listed = await listInvites(userId);
    expect(listed.map((row) => row.id)).toEqual([invite.id]);
  });

  it("refuses an account that signed up via invite", async () => {
    const created = await createCredentialUser({
      email: freshEmail("guest"),
      password: PASSWORD,
    });
    createdUserIds.push(created.id);

    await expect(createInvite(created.id)).rejects.toThrow(/cannot create invites/);
    expect(await listInvites(created.id)).toEqual([]);
  });

  it("does not let one user list or revoke another's invite", async () => {
    const ownerId = await provisioned();
    const otherId = await provisioned();
    const invite = await createInvite(ownerId);

    expect(await listInvites(otherId)).toEqual([]);
    await expect(revokeInvite(otherId, invite.id)).rejects.toThrow(/not found/);

    const still = await listInvites(ownerId);
    expect(still).toHaveLength(1);
    expect(still[0].revokedAt).toBeNull();
  });

  it("makes a revoked token inert without deleting earlier accounts", async () => {
    const ownerId = await provisioned();
    const invite = await createInvite(ownerId);
    const first = await redeemInvite({
      token: invite.token,
      email: freshEmail("first"),
      password: PASSWORD,
    });
    createdUserIds.push(first.id);

    await revokeInvite(ownerId, invite.id);
    expect(await isInviteRedeemable(invite.token)).toBe(false);

    await expect(
      redeemInvite({
        token: invite.token,
        email: freshEmail("late"),
        password: PASSWORD,
      }),
    ).rejects.toThrow(/invalid or has been revoked/);

    const [still] = await db.select().from(users).where(eq(users.id, first.id));
    expect(still.email).toBe(first.email);
  });
});

describeDb("redeemInvite", () => {
  it("creates an empty isolated account that cannot mint", async () => {
    const ownerId = await provisioned();
    await db.insert(nodes).values({
      userId: ownerId,
      parentId: null,
      type: "result_area",
      name: "Private",
      sortKey: "a0",
    });
    const invite = await createInvite(ownerId);

    const guest = await redeemInvite({
      token: invite.token,
      email: freshEmail("empty"),
      password: PASSWORD,
    });
    createdUserIds.push(guest.id);

    const [row] = await db.select().from(users).where(eq(users.id, guest.id));
    expect(row.canInvite).toBe(false);
    expect(await loadOutline(guest.id)).toEqual([]);
    expect((await loadOutline(ownerId)).map((n) => n.name)).toEqual(["Private"]);
    await expect(createInvite(guest.id)).rejects.toThrow(/cannot create invites/);
  });

  it("lets a second person use the same invite until it is revoked", async () => {
    const ownerId = await provisioned();
    const invite = await createInvite(ownerId);

    const a = await redeemInvite({
      token: invite.token,
      email: freshEmail("a"),
      password: PASSWORD,
    });
    const b = await redeemInvite({
      token: invite.token,
      email: freshEmail("b"),
      password: PASSWORD,
    });
    createdUserIds.push(a.id, b.id);

    const [listed] = await listInvites(ownerId);
    expect(listed.useCount).toBe(2);
    expect(a.id).not.toBe(b.id);
  });

  it("does not reset an existing password when the email is taken", async () => {
    const ownerId = await provisioned();
    const invite = await createInvite(ownerId);
    const existing = await upsertUser({
      email: freshEmail("taken"),
      password: PASSWORD,
    });
    createdUserIds.push(existing.id);

    await expect(
      redeemInvite({
        token: invite.token,
        email: existing.email,
        password: "different4567890xx",
      }),
    ).rejects.toThrow(/already exists/);

    const [listed] = await listInvites(ownerId);
    expect(listed.useCount).toBe(0);
  });

  it("rejects a missing token without creating a user", async () => {
    await expect(
      redeemInvite({
        token: "not-a-real-invite-token",
        email: freshEmail("bogus"),
        password: PASSWORD,
      }),
    ).rejects.toThrow(/invalid or has been revoked/);
  });
});
