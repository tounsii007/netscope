import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";
import { DnssecClient } from "./client";

export const metadata: Metadata = {
  title: "DNSSEC Validator",
  description: "Check DNSSEC deployment for any domain. See DS, DNSKEY and RRSIG records with warnings.",
  alternates: { canonical: "/dnssec" },
};

export default function Page() {
  return (
    <ToolShell title="DNSSEC Validator" subtitle="DS, DNSKEY and signature presence checks." icon={<Lock className="h-5 w-5" />}>
      <DnssecClient />
    </ToolShell>
  );
}
