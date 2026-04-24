import type { Metadata } from "next";
import { Globe2 } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";
import { PropagationClient } from "./client";

export const metadata: Metadata = {
  title: "DNS Propagation Checker — 15 global resolvers",
  description: "Check DNS propagation across 15+ public resolvers worldwide. See if your A, AAAA, MX, or TXT change is live everywhere.",
  alternates: { canonical: "/dns-propagation" },
};

export default function Page() {
  return (
    <ToolShell
      title="DNS Propagation"
      subtitle="Query 15 global resolvers in parallel to see where your record already resolves."
      icon={<Globe2 className="h-5 w-5" />}
    >
      <PropagationClient />
    </ToolShell>
  );
}
