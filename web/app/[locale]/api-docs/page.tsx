import { getTranslations, setRequestLocale } from "next-intl/server";
import { ExternalLink, Terminal } from "lucide-react";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "api_docs" });
  return { title: `${t("title")} — NetScope` };
}

const API_BASE = "https://api.netscope.io";
const SWAGGER_URL = "/api/swagger-ui";

const ENDPOINTS = [
  { method: "POST", path: "/api/v1/port/check",          descKey: "ep_port"  as const },
  { method: "GET",  path: "/api/v1/dns/{domain}",        descKey: "ep_dns"   as const },
  { method: "GET",  path: "/api/v1/ip/{ip}",             descKey: "ep_ip"    as const },
  { method: "GET",  path: "/api/v1/ssl/{host}",          descKey: "ep_ssl"   as const },
  { method: "GET",  path: "/api/v1/whois/{domain}",      descKey: "ep_whois" as const },
  { method: "POST", path: "/api/v1/email/verify",        descKey: "ep_email" as const },
];

export default async function ApiDocsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("api_docs");

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:py-16 space-y-10">
      <header>
        <h1 className="text-3xl sm:text-4xl font-bold">{t("title")}</h1>
        <p className="mt-3 text-fg-muted">{t("subtitle")}</p>

        {/* Swagger UI link — bright, prominent. The backend exposes a live
            OpenAPI/Swagger interface; the README documents it but most
            users never find it. Make it the first call to action. */}
        <a
          href={SWAGGER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover transition"
        >
          <ExternalLink className="h-4 w-4" />
          {t("swagger_open")}
        </a>
      </header>

      {/* ── Authentication ─────────────────────────────────────────────── */}
      <section className="card">
        <h2 className="text-lg font-semibold">{t("auth_title")}</h2>
        <p className="mt-2 text-sm text-fg-muted">{t("auth_text")}</p>
        <pre className="mt-3 overflow-x-auto rounded-md bg-bg-elevated p-3 text-xs">
          <code>{`curl -H "X-API-Key: netscope_live_xxxxxxxxxxxxxxxx" \\
     ${API_BASE}/api/v1/dns/example.com`}</code>
        </pre>
      </section>

      {/* ── Base URL ──────────────────────────────────────────────────── */}
      <section className="card">
        <h2 className="text-lg font-semibold">{t("base_url")}</h2>
        <pre className="mt-3 overflow-x-auto rounded-md bg-bg-elevated p-3 text-xs">
          <code>{API_BASE}</code>
        </pre>
      </section>

      {/* ── Endpoints ─────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold mb-4">{t("endpoints_title")}</h2>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-bg-elevated">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-xs uppercase text-fg-subtle">Method</th>
                <th className="px-4 py-2.5 text-left font-medium text-xs uppercase text-fg-subtle">Path</th>
                <th className="px-4 py-2.5 text-left font-medium text-xs uppercase text-fg-subtle">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {ENDPOINTS.map((e) => (
                <tr key={e.path} className="hover:bg-bg-elevated/30">
                  <td className="px-4 py-2.5 font-mono">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                      e.method === "GET" ? "bg-success/15 text-success" : "bg-brand/15 text-brand"
                    }`}>
                      {e.method}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">{e.path}</td>
                  <td className="px-4 py-2.5 text-fg-muted">{t(e.descKey)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Quick examples ────────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Terminal className="h-5 w-5" />
          {t("examples_title")}
        </h2>
        <div className="space-y-4">
          <CodeExample
            title="Port Check"
            code={`curl -X POST ${API_BASE}/api/v1/port/check \\
  -H "Content-Type: application/json" \\
  -d '{"target":"google.com","port":443,"protocol":"tcp"}'`}
          />
          <CodeExample
            title="DNS Lookup"
            code={`curl ${API_BASE}/api/v1/dns/cloudflare.com?type=A,AAAA,MX`}
          />
          <CodeExample
            title="IP Geolocation"
            code={`curl ${API_BASE}/api/v1/ip/8.8.8.8`}
          />
          <CodeExample
            title="SSL Inspection"
            code={`curl "${API_BASE}/api/v1/ssl/github.com?port=443"`}
          />
          <CodeExample
            title="Email Verify"
            code={`curl -X POST ${API_BASE}/api/v1/email/verify \\
  -H "Content-Type: application/json" \\
  -d '{"email":"alice@example.com","smtpProbe":false}'`}
          />
        </div>
      </section>

      {/* ── Rate limits ───────────────────────────────────────────────── */}
      <section className="card">
        <h2 className="text-lg font-semibold">{t("rate_title")}</h2>
        <p className="mt-2 text-sm text-fg-muted">{t("rate_text")}</p>
        <pre className="mt-3 overflow-x-auto rounded-md bg-bg-elevated p-3 text-xs">
          <code>{`X-RateLimit-Limit:     30
X-RateLimit-Remaining: 27
Retry-After:           60     # only on HTTP 429`}</code>
        </pre>
      </section>

      {/* ── Error format ──────────────────────────────────────────────── */}
      <section className="card">
        <h2 className="text-lg font-semibold">{t("errors_title")}</h2>
        <p className="mt-2 text-sm text-fg-muted">{t("errors_text")}</p>
        <pre className="mt-3 overflow-x-auto rounded-md bg-bg-elevated p-3 text-xs">
          <code>{`{
  "error": "Bad Request",
  "message": "invalid IP",
  "timestamp": "2026-04-28T12:34:56.789Z"
}`}</code>
        </pre>
      </section>

      {/* ── Libraries ─────────────────────────────────────────────────── */}
      <section className="card">
        <h2 className="text-lg font-semibold">{t("library_title")}</h2>
        <p className="mt-2 text-sm text-fg-muted">{t("library_text")}</p>
      </section>
    </div>
  );
}

function CodeExample({ title, code }: { title: string; code: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-card overflow-hidden">
      <div className="px-4 py-2 bg-bg-elevated text-xs font-medium text-fg-muted border-b border-border">
        {title}
      </div>
      <pre className="overflow-x-auto p-4 text-xs">
        <code>{code}</code>
      </pre>
    </div>
  );
}
