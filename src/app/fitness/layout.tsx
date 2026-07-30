import { TabStrip } from "@/components/shell/TabStrip";

export default function FitnessLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TabStrip active="fitness" />
      {children}
    </div>
  );
}
