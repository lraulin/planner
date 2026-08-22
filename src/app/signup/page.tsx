import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth/SignupForm";
import { isInviteRedeemable } from "@/lib/auth/invites";
import { auth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (session?.user) {
    redirect("/plan");
  }

  const token = (await searchParams).invite?.trim() ?? "";
  const valid = token.length > 0 && (await isInviteRedeemable(token));

  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-shell px-4">
      <div className="w-full max-w-sm rounded-md border border-rule bg-surface p-6 shadow-sm">
        <h1 className="text-base font-semibold tracking-tight text-ink">Planner</h1>
        {valid ? (
          <>
            <p className="mt-1 text-[0.8125rem] text-ink-muted">
              Create an account. You will get your own empty planner — not someone
              else&apos;s.
            </p>
            <SignupForm token={token} />
          </>
        ) : (
          <>
            <p className="mt-1 text-[0.8125rem] text-ink-muted">
              This invite is invalid or has been revoked.
            </p>
            <p className="mt-4 text-[0.8125rem]">
              <Link href="/login" className="text-ink underline underline-offset-2">
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
