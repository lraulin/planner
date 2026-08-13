"use server";

import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { codeRedirect, parseAuthorizeRequest } from "@/lib/oauth/authorize";
import { publicOrigin } from "@/lib/oauth/origin";
import { issueAuthCode } from "@/lib/oauth/tokens";

export async function approveMcpAuthorization(formData: FormData): Promise<void> {
  const userId = await getCurrentUserId();
  const params: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") params[key] = value;
  }

  const parsed = await parseAuthorizeRequest(params, publicOrigin());
  if (!parsed.ok) {
    throw new Error(parsed.message);
  }

  const code = issueAuthCode({
    sub: userId,
    clientId: parsed.query.clientId,
    redirectUri: parsed.query.redirectUri,
    challenge: parsed.query.codeChallenge,
    method: "S256",
    resource: parsed.resource,
  });

  redirect(codeRedirect(parsed.query.redirectUri, code, parsed.query.state));
}
