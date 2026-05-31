/**
 * Single-stat cell rendered by the SSL inspector's main result panel.
 * Used once per "interesting" certificate property — TLS version,
 * cipher suite, valid-from / valid-to dates, issuer, expiry days,
 * public-key algorithm, etc.
 *
 * Lives in its own file so the inspector's main client.tsx can stay
 * focused on form state + result orchestration instead of holding the
 * style definitions of every leaf component.
 */

import * as React from "react";

type Props = {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
};

export function CertField({ icon, label, value }: Props) {
  return (
    <div className="rounded-lg border border-border/60 bg-bg-elevated/60 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
        <span className="text-violet-soft/80">{icon}</span>
        {label}
      </div>
      <div className="mt-1 truncate font-mono text-sm text-fg">{value}</div>
    </div>
  );
}
