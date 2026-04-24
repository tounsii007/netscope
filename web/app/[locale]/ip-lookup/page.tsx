import type { Metadata } from "next";
import { Suspense } from "react";
import { Globe } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";
import { Spinner } from "@/components/tool-shell";
import { IpClient } from "./client";

export const metadata: Metadata = {
  title: "IP Lookup — Geolocation, ASN, VPN/Proxy detection",
  description: "Look up any IP: country, city, ISP, ASN, timezone. Detect VPN, proxy, TOR, hosting.",
  alternates: { canonical: "/ip-lookup" },
};

// IpClient uses useSearchParams() which requires a Suspense boundary in Next.js 15.
// Without it the whole page throws during SSR when ?host= param is present.
export default function Page() {
  return (
    <ToolShell title="IP Lookup" subtitle="Geolocation, ASN, ISP and threat intelligence." icon={<Globe className="h-5 w-5" />}>
      <Suspense fallback={<div className="card flex items-center gap-2"><Spinner /> Loading…</div>}>
        <IpClient />
      </Suspense>
    </ToolShell>
  );
}
