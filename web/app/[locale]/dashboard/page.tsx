import type { Metadata } from "next";
import { Activity } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";
import { DashboardClient } from "./client";

export const metadata: Metadata = {
  title: "My IP Dashboard",
  description: "Your IP, location, ISP, browser, OS, screen, timezone — all in one view.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <ToolShell title="My IP Dashboard" subtitle="Everything we can detect about your connection." icon={<Activity className="h-5 w-5" />}>
      <DashboardClient />
    </ToolShell>
  );
}
