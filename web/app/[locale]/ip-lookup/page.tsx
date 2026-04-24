import type { Metadata } from "next";
import { Globe } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";
import { IpClient } from "./client";

export const metadata: Metadata = {
  title: "IP Lookup — Geolocation, ASN, VPN/Proxy detection",
  description: "Look up any IP: country, city, ISP, ASN, timezone. Detect VPN, proxy, TOR, hosting.",
  alternates: { canonical: "/ip-lookup" },
};

export default function Page() {
  return (
    <ToolShell title="IP Lookup" subtitle="Geolocation, ASN, ISP and threat intelligence." icon={<Globe className="h-5 w-5" />}>
      <IpClient />
    </ToolShell>
  );
}
