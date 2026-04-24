import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";
import { PasswordLeakClient } from "./client";

export const metadata: Metadata = {
  title: "Password Leak Check — HIBP k-Anonymity",
  description: "Check if your password appears in known data breaches. Uses Have I Been Pwned's k-anonymity API — only the first 5 SHA-1 characters are ever sent.",
  alternates: { canonical: "/password-leak" },
};

export default function Page() {
  return (
    <ToolShell title="Password Leak Check" subtitle="Uses HIBP k-anonymity: your password never leaves your browser." icon={<KeyRound className="h-5 w-5" />}>
      <PasswordLeakClient />
    </ToolShell>
  );
}
