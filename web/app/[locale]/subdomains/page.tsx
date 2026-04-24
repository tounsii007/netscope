import type { Metadata } from "next";
import { GitBranch } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";
import { SubdomainsClient } from "./client";

export const metadata: Metadata = {
  title: "Subdomain Finder — Certificate Transparency",
  description: "Enumerate subdomains from public Certificate Transparency logs. Fast, passive, no scanning.",
  alternates: { canonical: "/subdomains" },
};

export default function Page() {
  return (
    <ToolShell
      title="Subdomain Finder"
      subtitle="Passive enumeration from Certificate Transparency logs (crt.sh)."
      icon={<GitBranch className="h-5 w-5" />}
    >
      <SubdomainsClient />
    </ToolShell>
  );
}
