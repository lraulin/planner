import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { safeCallbackPath } from "@/lib/auth/callback-url";
import { auth } from "@/lib/auth/server";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const params = await searchParams;
  const callbackUrl = safeCallbackPath(params.callbackUrl);

  if (session?.user) {
    redirect(callbackUrl);
  }

  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-shell px-4">
      <div className="w-full max-w-sm rounded-md border border-rule bg-surface p-6 shadow-sm">
        <h1 className="text-base font-semibold tracking-tight text-ink">Planner</h1>
        <p className="mt-1 text-[0.8125rem] text-ink-muted">
          Sign in to access your outline and schedule.
        </p>
        <LoginForm callbackUrl={callbackUrl} />
      </div>
    </main>
  );
}
