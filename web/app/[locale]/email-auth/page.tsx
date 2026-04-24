import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";
import { EmailAuthClient } from "./client";

export const metadata: Metadata = {
  title: "SPF / DKIM / DMARC Analyzer",
  description: "Check email authentication records for any domain. See SPF policy, DMARC enforcement and DKIM setup with warnings.",
  alternates: { canonical: "/email-auth" },
};

export default function Page() {
  return (
    <ToolShell title="SPF / DKIM / DMARC" subtitle="Parse and grade email authentication for any domain." icon={<ShieldAlert className="h-5 w-5" />}>
      <EmailAuthClient />
    </ToolShell>
  );
}
