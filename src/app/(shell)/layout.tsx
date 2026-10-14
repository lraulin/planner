import { AppShell } from "@/components/shell/AppShell";
import { CacheEpoch } from "@/components/shell/CacheEpoch";

/**
 * The signed-in shell, rendered once above every module's pages.
 *
 * A route group, so it adds nothing to a URL. `/login`, `/signup`, `/oauth/authorize` and
 * `/settings` stay outside it on purpose: they are not in the module registry and must not
 * grow a sidebar (`navigation.md`). Which module is active is read from the pathname by the
 * shell itself, so no page names it.
 */
export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* A new id each time this layout renders: only a refresh or a revalidating action does. */}
      <CacheEpoch epoch={crypto.randomUUID()} />
      <AppShell>{children}</AppShell>
    </>
  );
}
