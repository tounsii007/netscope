import type { Metadata } from "next";
import { Unlock } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";
import { MixedClient } from "./client";

export const metadata: Metadata = {
  title: "Mixed Content Scanner",
  description: "Find insecure http:// resources on your HTTPS pages that browsers block or warn about.",
  alternates: { canonical: "/mixed-content" },
};

export default function Page() {
  return (
    <ToolShell title="Mixed Content" subtitle="Find insecure http:// resources on HTTPS pages." icon={<Unlock className="h-5 w-5" />}>
      <MixedClient />
    </ToolShell>
  );
}
