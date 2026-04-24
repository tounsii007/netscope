import type { Metadata } from "next";
import { ShieldX } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";
import { BlacklistClient } from "./client";

export const metadata: Metadata = {
  title: "IP Blacklist Check — 20+ DNSBLs",
  description: "Check if an IP is on 20+ major spam blacklists (Spamhaus, Barracuda, SORBS). Instant, parallel DNSBL queries.",
  alternates: { canonical: "/blacklist" },
};

export default function Page() {
  return (
    <ToolShell title="IP Blacklist" subtitle="Query 20+ major DNSBLs in parallel." icon={<ShieldX className="h-5 w-5" />}>
      <BlacklistClient />
    </ToolShell>
  );
}
