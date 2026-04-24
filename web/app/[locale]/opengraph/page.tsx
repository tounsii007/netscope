import type { Metadata } from "next";
import { Image } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";
import { OgClient } from "./client";

export const metadata: Metadata = {
  title: "Open Graph & Meta Preview",
  description: "Preview how your URL looks when shared on Twitter, Facebook, LinkedIn, Slack.",
  alternates: { canonical: "/opengraph" },
};

export default function Page() {
  return (
    <ToolShell title="Open Graph Preview" subtitle="How your URL renders on Twitter, Facebook, LinkedIn, Slack." icon={<Image className="h-5 w-5" />}>
      <OgClient />
    </ToolShell>
  );
}
