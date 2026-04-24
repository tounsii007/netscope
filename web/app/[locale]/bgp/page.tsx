import type { Metadata } from "next";
import { Route } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";
import { BgpClient } from "./client";

export const metadata: Metadata = {
  title: "BGP / ASN Viewer",
  description: "Look up the BGP prefix, announcing ASNs and route of any IP. Or inspect an ASN's announced prefixes.",
  alternates: { canonical: "/bgp" },
};

export default function Page() {
  return (
    <ToolShell title="BGP / ASN" subtitle="Routing intelligence via RIPE Stat." icon={<Route className="h-5 w-5" />}>
      <BgpClient />
    </ToolShell>
  );
}
