import type { Metadata } from "next";
import { Layers } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";
import { TechClient } from "./client";

export const metadata: Metadata = {
  title: "Tech Stack Detector — What's this site built with?",
  description: "Detect frameworks, CMS, analytics, ecommerce, hosting and libraries from public response data.",
  alternates: { canonical: "/tech-stack" },
};

export default function Page() {
  return (
    <ToolShell title="Tech Stack Detector" subtitle="Fingerprint frameworks, CMS, analytics, widgets and hosting." icon={<Layers className="h-5 w-5" />}>
      <TechClient />
    </ToolShell>
  );
}
