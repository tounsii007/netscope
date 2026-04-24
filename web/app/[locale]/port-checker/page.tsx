import type { Metadata } from "next";
import { PortCheckerClient } from "./client";
import { Network } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";

export const metadata: Metadata = {
  title: "Port Checker — Scan TCP ports online",
  description: "Check if a port is open on any server. Scan single ports, ranges, or common ports with latency and service detection.",
  alternates: { canonical: "/port-checker" },
};

export default function Page() {
  return (
    <ToolShell
      title="Port Checker"
      subtitle="Check a port or scan ranges on any host — with service detection and latency."
      icon={<Network className="h-5 w-5" />}
    >
      <PortCheckerClient />
    </ToolShell>
  );
}
