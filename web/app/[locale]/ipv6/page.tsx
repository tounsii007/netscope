import type { Metadata } from "next";
import { Wifi } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";
import { Ipv6Client } from "./client";

export const metadata: Metadata = {
  title: "IPv6 Readiness Score",
  description: "Grade your domain's IPv6 deployment across apex, www, nameservers, and mail.",
  alternates: { canonical: "/ipv6" },
};

export default function Page() {
  return (
    <ToolShell title="IPv6 Readiness" subtitle="AAAA coverage across apex, www, NS and MX." icon={<Wifi className="h-5 w-5" />}>
      <Ipv6Client />
    </ToolShell>
  );
}
