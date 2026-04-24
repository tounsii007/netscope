import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";
import { JwtClient } from "./client";

export const metadata: Metadata = {
  title: "JWT Decoder — Inspect JSON Web Tokens",
  description: "Paste a JWT to decode header and payload, inspect claims, and verify expiry — entirely in your browser, nothing sent to servers.",
  alternates: { canonical: "/jwt" },
};

export default function Page() {
  return (
    <ToolShell
      title="JWT Decoder"
      subtitle="Paste any JWT — decoded entirely in your browser. Nothing leaves your device."
      icon={<KeyRound className="h-5 w-5" />}
    >
      <JwtClient />
    </ToolShell>
  );
}
