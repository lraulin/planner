"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { redeemInviteAction } from "@/app/signup/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/passwordPolicy";

const inputClass =
  "min-h-tap rounded border border-rule bg-surface px-2.5 py-1.5 text-base text-ink outline-none focus:border-select-edge md:min-h-0 md:text-[0.8125rem]";

export function SignupForm({ token }: { token: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    setPending(true);
    try {
      const result = await redeemInviteAction({
        token,
        email: email.trim(),
        password,
      });
      if (result.ok) {
        router.replace("/plan");
        router.refresh();
        return;
      }
      setError(result.error);
    } catch {
      setError("Could not create the account.");
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
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-[0.8125rem]">
        <span className="text-ink-muted">Password</span>
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </label>
      <p className="text-[0.75rem] text-ink-faint">
        At least {MIN_PASSWORD_LENGTH} characters.
      </p>
      <label className="flex flex-col gap-1 text-[0.8125rem]">
        <span className="text-ink-muted">Confirm password</span>
        <input
          type="password"
          name="confirm"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputClass}
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
        className="mt-1 min-h-tap rounded bg-ink px-3 py-1.5 text-[0.8125rem] font-medium text-surface disabled:opacity-60 md:min-h-0"
      >
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
