import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/lib/auth";
import { parseAuthorizeRequest } from "@/lib/oauth/authorize";
import { redirectHost } from "@/lib/oauth/clients";
import { publicOrigin } from "@/lib/oauth/origin";
import { approveMcpAuthorization } from "./actions";

export default async function AuthorizeMcpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const parsed = await parseAuthorizeRequest(params, publicOrigin());

  if (!parsed.ok) {
    if (parsed.redirectTo) redirect(parsed.redirectTo);
    return (
      <main className="flex min-h-full flex-1 items-center justify-center bg-shell px-4">
        <div className="w-full max-w-sm rounded-md border border-rule bg-surface p-6 shadow-sm">
          <h1 className="text-base font-semibold tracking-tight text-ink">
            Cannot connect
          </h1>
          <p className="mt-2 text-[0.8125rem] text-ink-muted">{parsed.message}</p>
        </div>
      </main>
    );
  }

  let account: { email: string };
  try {
    account = await getCurrentAccount();
  } catch {
    const returnTo = `/oauth/authorize?${new URLSearchParams(
      Object.fromEntries(
        Object.entries(params).flatMap(([key, value]) =>
          typeof value === "string" ? [[key, value] as const] : [],
        ),
      ),
    ).toString()}`;
    redirect(`/login?callbackUrl=${encodeURIComponent(returnTo)}`);
  }

  const { query, client } = parsed;
  const returnHost = redirectHost(query.redirectUri);

  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-shell px-4">
      <div className="w-full max-w-sm rounded-md border border-rule bg-surface p-6 shadow-sm">
        <h1 className="text-base font-semibold tracking-tight text-ink">
          Connect Planner
        </h1>
        <p className="mt-2 text-[0.8125rem] text-ink-muted">
          <span className="text-ink">{client.clientName}</span> wants to read and update
          your planner as <span className="text-ink">{account.email}</span>. After you
          approve, you will return to <span className="text-ink">{returnHost}</span>.
        </p>
        <form action={approveMcpAuthorization} className="mt-5 flex flex-col gap-2">
          <input type="hidden" name="response_type" value={query.responseType} />
          <input type="hidden" name="client_id" value={query.clientId} />
          <input type="hidden" name="redirect_uri" value={query.redirectUri} />
          <input type="hidden" name="state" value={query.state} />
          <input type="hidden" name="code_challenge" value={query.codeChallenge} />
          <input
            type="hidden"
            name="code_challenge_method"
            value={query.codeChallengeMethod}
          />
          <input type="hidden" name="scope" value={query.scope} />
          <input type="hidden" name="resource" value={parsed.resource} />
          <button
            type="submit"
            className="rounded-md bg-ink px-3 py-2 text-sm font-medium text-surface"
          >
            Approve
          </button>
        </form>
      </div>
    </main>
  );
}
