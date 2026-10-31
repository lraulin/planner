import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { users } from "../src/db/schema";
import { argValue } from "./cli";

/**
 * The user `--user` names, by id or by email, or null when the flag is absent. An email
 * that names nobody in this database throws, so a script never runs against "no user".
 */
export async function userFromArgs(): Promise<string | null> {
  const given = argValue("--user");
  if (!given?.includes("@")) return given;
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, given));
  if (!user) throw new Error(`No user ${given} in this database.`);
  return user.id;
}
