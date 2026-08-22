"use client";

import { useState, type FormEvent } from "react";
import { changePasswordAction } from "@/app/settings/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/passwordPolicy";

const inputClass =
  "min-h-tap rounded border border-rule bg-surface px-2.5 py-1.5 text-base text-ink outline-none focus:border-select-edge md:min-h-0 md:text-[0.8125rem]";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    if (newPassword !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true);
    try {
      const result = await changePasswordAction(currentPassword, newPassword);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      setSaved(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        void onSubmit(event);
      }}
      className="mt-5 border-t border-rule pt-4"
    >
      <h3 className="text-[0.8125rem] font-medium text-ink">Change password</h3>
      <div className="mt-3 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-[0.8125rem]">
          <span className="text-ink-muted">Current password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-[0.8125rem]">
          <span className="text-ink-muted">New password</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputClass}
          />
        </label>
        <p className="text-[0.75rem] text-ink-faint">
          At least {MIN_PASSWORD_LENGTH} characters.
        </p>
        <label className="flex flex-col gap-1 text-[0.8125rem]">
          <span className="text-ink-muted">Confirm new password</span>
          <input
            type="password"
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
        {saved ? (
          <p className="text-[0.8125rem] text-ink-muted" role="status">
            Password updated.
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="min-h-tap w-full rounded border border-rule px-3 py-1.5 text-[0.8125rem] font-medium text-ink sm:w-auto md:min-h-0"
        >
          {pending ? "Saving…" : "Update password"}
        </button>
      </div>
    </form>
  );
}
