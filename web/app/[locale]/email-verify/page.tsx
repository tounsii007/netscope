import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";
import { EmailVerifyClient } from "./client";

export const metadata: Metadata = {
  title: "Email Verifier — MX, disposable, SMTP probe",
  description: "Verify any email address: syntax, MX records, disposable provider check, optional SMTP handshake.",
  alternates: { canonical: "/email-verify" },
};

export default function Page() {
  return (
    <ToolShell title="Email Verifier" subtitle="Syntax + MX + disposable detection + optional SMTP RCPT probe." icon={<Mail className="h-5 w-5" />}>
      <EmailVerifyClient />
    </ToolShell>
  );
}
