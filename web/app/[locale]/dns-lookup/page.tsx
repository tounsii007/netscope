import type { Metadata } from "next";
import { DnsClient } from "./client";
import { Search } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";

export const metadata: Metadata = {
  title: "DNS Lookup — A, AAAA, MX, TXT, NS records",
  description: "Fast DNS lookup for any domain. View A, AAAA, MX, TXT, CNAME, NS and CAA records.",
  alternates: { canonical: "/dns-lookup" },
};

export default function Page() {
  return (
    <ToolShell title="DNS Lookup" subtitle="Query DNS records for any domain." icon={<Search className="h-5 w-5" />}>
      <DnsClient />
    </ToolShell>
  );
}
