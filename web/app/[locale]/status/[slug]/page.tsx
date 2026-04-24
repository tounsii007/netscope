import type { Metadata } from "next";
import { notFound } from "next/navigation";

interface PublicStatus {
  name: string; description?: string; logo?: string; brandColor?: string;
  overallStatus: string;
  incidents: Array<{ id: string; title: string; status: string; impact: string;
    body: string; startedAt: string; resolvedAt?: string }>;
  monitors: Array<{ name: string; up: boolean; uptime24h: number }>;
}

async function fetchStatus(slug: string): Promise<PublicStatus | null> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
  try {
    const res = await fetch(`${base}/api/v1/status-pages/public/${encodeURIComponent(slug)}`,
      { next: { revalidate: 30 } });
    if (!res.ok) return null;
    return (await res.json()) as PublicStatus;
  } catch { return null; }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchStatus(slug);
  return {
    title: data ? `${data.name} status` : "Status page",
    description: data?.description ?? "Public status page",
  };
}

const STATUS_COLOR: Record<string, string> = {
  OPERATIONAL: "bg-success",
  MINOR: "bg-warn",
  MAJOR: "bg-danger",
  CRITICAL: "bg-danger",
};

export default async function StatusPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await fetchStatus(slug);
  if (!data) notFound();

  const operational = data.overallStatus === "OPERATIONAL";
  return (
    <div className="mx-auto max-w-3xl py-12">
      <header className="mb-8 flex items-center gap-4">
        {data.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.logo} alt="" className="h-10 w-10 rounded" />
        )}
        <div>
          <h1 className="text-3xl font-semibold">{data.name}</h1>
          {data.description && <p className="text-fg-muted">{data.description}</p>}
        </div>
      </header>

      <div className={`card mb-8 flex items-center gap-3 border-l-4 ${operational ? "border-success" : "border-danger"}`}>
        <span className={`h-3 w-3 animate-pulse-glow rounded-full ${STATUS_COLOR[data.overallStatus] ?? "bg-warn"}`} />
        <span className="text-lg font-medium">
          {operational ? "All systems operational" : `Currently degraded (${data.overallStatus})`}
        </span>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase text-fg-muted">Services</h2>
        <div className="space-y-2">
          {data.monitors.length === 0 && (
            <div className="card text-sm text-fg-muted">No public services configured.</div>
          )}
          {data.monitors.map((m) => (
            <div key={m.name} className="card flex items-center justify-between">
              <span>{m.name}</span>
              <span className={m.up ? "text-success" : "text-danger"}>
                {m.up ? "Operational" : "Down"}
                <span className="ml-2 text-xs text-fg-muted">{m.uptime24h.toFixed(2)}% 24h</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase text-fg-muted">Incident history</h2>
        {data.incidents.length === 0 ? (
          <div className="card text-sm text-fg-muted">No incidents reported.</div>
        ) : (
          <ol className="space-y-3">
            {data.incidents.map((i) => (
              <li key={i.id} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold">{i.title}</h3>
                    <time className="text-xs text-fg-muted">{new Date(i.startedAt).toLocaleString()}</time>
                  </div>
                  <span className={`badge ${i.status === "RESOLVED" ? "bg-success/15 text-success" : "bg-warn/15 text-warn"}`}>
                    {i.status}
                  </span>
                </div>
                {i.body && <p className="mt-2 text-sm text-fg-muted whitespace-pre-wrap">{i.body}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
