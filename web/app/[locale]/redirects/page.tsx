import type { Metadata } from "next";
import { ArrowRightLeft } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";
import { RedirectsClient } from "./client";

export const metadata: Metadata = {
  title: "Redirect Chain Tracer",
  description: "Trace every hop of a URL's redirect chain. Spot loops, HTTPS downgrades, and too-many-redirects that hurt SEO.",
  alternates: { canonical: "/redirects" },
};

export default function Page() {
  return (
    <ToolShell title="Redirect Tracer" subtitle="Follow every hop and flag loops, downgrades, slow redirects." icon={<ArrowRightLeft className="h-5 w-5" />}>
      <RedirectsClient />
    </ToolShell>
  );
}
