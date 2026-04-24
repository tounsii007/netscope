import type { Metadata } from "next";
import { Cookie } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";
import { CookieClient } from "./client";

export const metadata: Metadata = {
  title: "Cookie & GDPR Analyzer",
  description: "Inspect Set-Cookie flags and third-party trackers loaded on any page. GDPR risk score.",
  alternates: { canonical: "/cookies" },
};

export default function Page() {
  return (
    <ToolShell title="Cookie & GDPR" subtitle="Cookie flags + third-party tracker detection." icon={<Cookie className="h-5 w-5" />}>
      <CookieClient />
    </ToolShell>
  );
}
