import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";
import { HeadersClient } from "./client";

export const metadata: Metadata = {
  title: "HTTP Security Headers Inspector",
  description: "Grade your site's HTTP security headers A+ to F. Check HSTS, CSP, X-Frame-Options and more.",
  alternates: { canonical: "/http-headers" },
};

export default function Page() {
  return (
    <ToolShell
      title="HTTP Security Headers"
      subtitle="Analyze response headers and grade the security posture from A+ to F."
      icon={<ShieldCheck className="h-5 w-5" />}
    >
      <HeadersClient />
    </ToolShell>
  );
}
