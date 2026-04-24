import type { Metadata } from "next";
import { Server } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";
import { WhoisClient } from "./client";

export const metadata: Metadata = {
  title: "WHOIS / RDAP Lookup",
  description: "Modern RDAP-based domain registration lookup: registrar, status, nameservers, dates.",
  alternates: { canonical: "/whois" },
};

export default function Page() {
  return (
    <ToolShell title="WHOIS / RDAP" subtitle="Structured registration data via RDAP (RFC 7483)." icon={<Server className="h-5 w-5" />}>
      <WhoisClient />
    </ToolShell>
  );
}
