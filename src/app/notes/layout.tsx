import { AppShell } from "@/components/shell/AppShell";

export default function NotesLayout({ children }: { children: React.ReactNode }) {
  return <AppShell active="notes">{children}</AppShell>;
}
