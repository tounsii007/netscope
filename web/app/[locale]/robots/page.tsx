import type { Metadata } from "next";
import { FileSearch } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";
import { RobotsClient } from "./client";

export const metadata: Metadata = {
  title: "Robots.txt & Sitemap Validator",
  description: "Parse and validate robots.txt rules and sitemap XML for any host.",
  alternates: { canonical: "/robots" },
};

export default function Page() {
  return (
    <ToolShell title="Robots & Sitemap" subtitle="Parse robots.txt rules, discover and validate sitemaps." icon={<FileSearch className="h-5 w-5" />}>
      <RobotsClient />
    </ToolShell>
  );
}
