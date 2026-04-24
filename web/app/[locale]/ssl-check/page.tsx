import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";
import { SslClient } from "./client";

export const metadata: Metadata = {
  title: "SSL Certificate Checker — TLS inspection",
  description: "Inspect SSL/TLS certificates: issuer, chain, expiry, cipher suite and TLS version.",
  alternates: { canonical: "/ssl-check" },
};

export default function Page() {
  return (
    <ToolShell title="SSL Certificate" subtitle="Inspect the TLS certificate served by any host." icon={<Lock className="h-5 w-5" />}>
      <SslClient />
    </ToolShell>
  );
}
