import type { Metadata } from "next";
import { Radar } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";
import { ReachClient } from "./client";

export const metadata: Metadata = {
  title: "Server Reachability Test",
  description: "Test HTTP, TCP and ping reachability to any server, with response time.",
  alternates: { canonical: "/reachability" },
};

export default function Page() {
  return (
    <ToolShell title="Reachability" subtitle="HTTP, TCP and ping checks combined." icon={<Radar className="h-5 w-5" />}>
      <ReachClient />
    </ToolShell>
  );
}
