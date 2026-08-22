"use server";

import { headers } from "next/headers";
import { actionErrorMessage, type ActionResult } from "../actionResult";
import { redeemInvite } from "@/lib/auth/invites";
import { auth } from "@/lib/auth/server";

/**
 * Unauthenticated on purpose: the guest has no session. `run()` would throw.
 * Creating the account is keyed by the invite token; signing in afterwards is what
 * issues the cookie.
 */
export async function redeemInviteAction(input: {
  token: string;
  email: string;
  password: string;
}): Promise<ActionResult> {
  try {
    const created = await redeemInvite(input);
    await auth.api.signInEmail({
      body: { email: created.email, password: input.password },
      headers: await headers(),
    });
    return { ok: true, id: created.id };
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error) };
  }
}
