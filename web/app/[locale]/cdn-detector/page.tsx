import type { Metadata } from "next";
import { Cloud } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";
import { CdnClient } from "./client";

export const metadata: Metadata = {
  title: "CDN Detector — What CDN is this site using?",
  description: "Detect Cloudflare, Fastly, Akamai, CloudFront, Vercel, Netlify and 12+ other CDNs.",
  alternates: { canonical: "/cdn-detector" },
};

export default function Page() {
  return (
    <ToolShell
      title="CDN Detector"
      subtitle="Identify the CDN or WAF in front of any host from response headers."
      icon={<Cloud className="h-5 w-5" />}
    >
      <CdnClient />
    </ToolShell>
  );
}
