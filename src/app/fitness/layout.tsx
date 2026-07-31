import { AppShell } from "@/components/shell/AppShell";

export default function FitnessLayout({ children }: { children: React.ReactNode }) {
  return <AppShell active="fitness">{children}</AppShell>;
}
