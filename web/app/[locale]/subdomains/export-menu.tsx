"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download, FileText, FileSpreadsheet } from "lucide-react";
import type { SubdomainsResult } from "@/lib/api";
import { exportTxt, exportCsv, exportJson } from "./export-helpers";

/**
 * Dropdown menu offering txt / csv / json downloads. Self-contained:
 * owns its own open/close state and renders a click-outside backdrop
 * so the parent component doesn't need to track export-menu state.
 */
export function ExportMenu({ data }: { data: SubdomainsResult }) {
  const t = useTranslations("subdomains");
  const [open, setOpen] = useState(false);

  const handle = (fn: (d: SubdomainsResult) => void) => () => {
    fn(data);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-ghost"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Download className="h-4 w-4" />
        {t("export")}
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div
            role="menu"
            className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-border bg-bg-elevated shadow-xl"
          >
            <MenuItem icon={FileText} label=".txt" count={data.count} onClick={handle(exportTxt)} />
            <MenuItem icon={FileSpreadsheet} label=".csv" onClick={handle(exportCsv)} />
            <MenuItem icon={FileText} label=".json" onClick={handle(exportJson)} />
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  count,
  onClick,
}: {
  icon: typeof FileText;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-bg-base"
    >
      <Icon className="h-4 w-4 text-fg-subtle" />
      <span>{label}</span>
      {count !== undefined && (
        <span className="ml-auto text-xs text-fg-subtle">{count}</span>
      )}
    </button>
  );
}
