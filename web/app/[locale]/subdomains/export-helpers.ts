import type { SubdomainsResult } from "@/lib/api";

/**
 * Trigger a browser download from an in-memory string. Lives outside the
 * component so the three export buttons (txt/csv/json) share one helper
 * and the React component stays focused on UI state.
 */
function download(content: string, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Plain newline-separated list — easiest to feed into other tools. */
export function exportTxt(data: SubdomainsResult) {
  download(
    data.subdomains.join("\n"),
    "text/plain;charset=utf-8",
    `${data.domain}-subdomains.txt`
  );
}

/**
 * CSV with header row. Every field is quoted defensively so future
 * sources that include commas or quotes inside a subdomain don't break
 * downstream parsers (Excel, pandas, etc.).
 */
export function exportCsv(data: SubdomainsResult) {
  const escape = (v: string | number) =>
    `"${String(v).replace(/"/g, '""')}"`;
  const header = ["index", "subdomain", "parent_domain", "source"]
    .map(escape)
    .join(",");
  const rows = data.subdomains.map((s, i) =>
    [i + 1, s, data.domain, data.source ?? ""].map(escape).join(",")
  );
  download(
    [header, ...rows].join("\n"),
    "text/csv;charset=utf-8",
    `${data.domain}-subdomains.csv`
  );
}

/** Pretty-printed JSON — preserves the full API result for diffing. */
export function exportJson(data: SubdomainsResult) {
  download(
    JSON.stringify(data, null, 2),
    "application/json;charset=utf-8",
    `${data.domain}-subdomains.json`
  );
}
