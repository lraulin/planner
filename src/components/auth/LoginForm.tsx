"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { signIn } from "@/lib/auth/client";

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await signIn.email({
        email: email.trim(),
        password,
        callbackURL: callbackUrl,
      });
      if (result.error) {
        setError(result.error.message || "Sign in failed");
        return;
      }
      router.replace(callbackUrl);
      router.refresh();
    } catch {
      setError("Sign in failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        void onSubmit(event);
      }}
      className="mt-5 flex flex-col gap-3"
    >
      <label className="flex flex-col gap-1 text-[0.8125rem]">
        <span className="text-ink-muted">Email</span>
        <input
          type="email"
          name="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border border-rule bg-surface px-2.5 py-1.5 text-ink outline-none focus:border-select-edge"
        />
      </label>
      <label className="flex flex-col gap-1 text-[0.8125rem]">
        <span className="text-ink-muted">Password</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border border-rule bg-surface px-2.5 py-1.5 text-ink outline-none focus:border-select-edge"
        />
      </label>
      {error ? (
        <p className="text-[0.8125rem] text-priority-a" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded bg-ink px-3 py-1.5 text-[0.8125rem] font-medium text-surface disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
