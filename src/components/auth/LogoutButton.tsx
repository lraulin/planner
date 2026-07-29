"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/lib/auth/client";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    try {
      await signOut();
      router.replace("/login");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => {
        void onClick();
      }}
      disabled={pending}
      className="ml-auto pb-2 text-[0.75rem] text-ink-muted hover:text-ink disabled:opacity-50"
    >
      {pending ? "…" : "Sign out"}
    </button>
  );
}
