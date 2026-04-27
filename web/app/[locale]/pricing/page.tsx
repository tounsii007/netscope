import Link from "next/link";
import { Check, X } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "pricing" });
  return { title: `${t("title")} — NetScope` };
}

export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pricing");

  /**
   * Three tiers in the canonical SaaS layout:
   *   • Free      — entry / lead-gen
   *   • Pro       — highlighted ("Most popular") to nudge upgrades
   *   • Enterprise — talk-to-sales, custom pricing
   *
   * Feature list grows down each column. ✓ for included, ✗ for excluded
   * (rendered as muted strikethrough). The middle column is visually elevated
   * via a brand-coloured top border, slightly higher elevation, and a "Most
   * popular" pill.
   */
  const features = [
    { key: "f_30_tools",            free: true,  pro: true,  ent: true  },
    { key: "f_rate_anon",           free: true,  pro: false, ent: false },
    { key: "f_rate_pro",            free: false, pro: true,  ent: false },
    { key: "f_rate_ent",            free: false, pro: false, ent: true  },
    { key: "f_history_7d",          free: true,  pro: false, ent: false },
    { key: "f_history_90d",         free: false, pro: true,  ent: false },
    { key: "f_history_unlimited",   free: false, pro: false, ent: true  },
    { key: "f_monitors_3",          free: true,  pro: false, ent: false },
    { key: "f_monitors_50",         free: false, pro: true,  ent: false },
    { key: "f_monitors_unlimited",  free: false, pro: false, ent: true  },
    { key: "f_webhooks",            free: false, pro: true,  ent: true  },
    { key: "f_api_access",          free: true,  pro: true,  ent: true  },
    { key: "f_workspaces",          free: false, pro: true,  ent: true  },
    { key: "f_sso",                 free: false, pro: false, ent: true  },
    { key: "f_audit",               free: false, pro: false, ent: true  },
    { key: "f_sla",                 free: false, pro: false, ent: true  },
    { key: "f_support_email",       free: true,  pro: false, ent: false },
    { key: "f_support_priority",    free: false, pro: true,  ent: false },
    { key: "f_support_dedicated",   free: false, pro: false, ent: true  },
  ] as const;

  const tier = (k: "free" | "pro" | "ent") => features.filter((f) => f[k]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
      <div className="text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">{t("title")}</h1>
        <p className="mt-3 text-fg-muted">{t("subtitle")}</p>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {/* ── Free tier ─────────────────────────────────────────────── */}
        <PricingCard
          name={t("free")}
          desc={t("free_desc")}
          price={t("free_price")}
          unit={t("month")}
          ctaText={t("cta_free")}
          ctaHref="/"
          ctaVariant="ghost"
          features={tier("free").map((f) => t(f.key as never))}
          allFeatures={features.map((f) => ({ label: t(f.key as never), included: f.free }))}
        />

        {/* ── Pro tier (highlighted) ────────────────────────────────── */}
        <PricingCard
          name={t("pro")}
          desc={t("pro_desc")}
          price={t("pro_price")}
          unit={t("month")}
          ctaText={t("cta_pro")}
          ctaHref="/sign-in"
          ctaVariant="brand"
          highlight
          highlightLabel={t("popular")}
          features={tier("pro").map((f) => t(f.key as never))}
          allFeatures={features.map((f) => ({ label: t(f.key as never), included: f.pro }))}
        />

        {/* ── Enterprise tier ───────────────────────────────────────── */}
        <PricingCard
          name={t("enterprise")}
          desc={t("enterprise_desc")}
          price={t("enterprise_price")}
          ctaText={t("cta_enterprise")}
          ctaHref="mailto:sales@netscope.io"
          ctaVariant="ghost"
          features={tier("ent").map((f) => t(f.key as never))}
          allFeatures={features.map((f) => ({ label: t(f.key as never), included: f.ent }))}
        />
      </div>

      {/* ── FAQ ────────────────────────────────────────────────────── */}
      <div className="mt-20 max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold mb-6">{t("faq_title")}</h2>
        <div className="space-y-4">
          <FaqItem q={t("faq_change_q")} a={t("faq_change_text")} />
          <FaqItem q={t("faq_refund_q")} a={t("faq_refund_text")} />
          <FaqItem q={t("faq_data_q")}   a={t("faq_data_text")} />
        </div>
      </div>
    </div>
  );
}

function PricingCard({
  name, desc, price, unit, ctaText, ctaHref, ctaVariant,
  highlight = false, highlightLabel, allFeatures,
}: {
  name: string; desc: string; price: string; unit?: string;
  ctaText: string; ctaHref: string; ctaVariant: "brand" | "ghost";
  highlight?: boolean; highlightLabel?: string;
  features: string[];
  allFeatures: { label: string; included: boolean }[];
}) {
  return (
    <div
      className={`relative rounded-xl border p-6 ${
        highlight
          ? "border-brand bg-bg-card shadow-[0_0_0_1px_rgba(249,115,22,0.5),0_8px_30px_-10px_rgba(249,115,22,0.4)]"
          : "border-border bg-bg-card"
      }`}
    >
      {highlight && highlightLabel && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">
          {highlightLabel}
        </span>
      )}
      <h3 className="text-lg font-semibold">{name}</h3>
      <p className="mt-1 text-sm text-fg-muted min-h-[40px]">{desc}</p>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-4xl font-bold">
          {price === "0" || /^[A-Za-zऀ-ॿ一-鿿]/.test(price) ? price : `€${price}`}
        </span>
        {unit && price !== "Custom" && !/^[A-Za-zऀ-ॿ一-鿿]/.test(price) && (
          <span className="text-sm text-fg-muted">/ {unit}</span>
        )}
      </div>
      <Link
        href={ctaHref}
        className={`mt-6 block w-full text-center ${
          ctaVariant === "brand" ? "btn" : "btn-ghost"
        }`}
      >
        {ctaText}
      </Link>
      <ul className="mt-6 space-y-2.5 text-sm">
        {allFeatures.map((f, i) => (
          <li key={i} className="flex items-start gap-2.5">
            {f.included ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            ) : (
              <X className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle/50" />
            )}
            <span className={f.included ? "text-fg" : "text-fg-subtle line-through"}>{f.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-lg border border-border bg-bg-card p-4">
      <summary className="cursor-pointer list-none font-medium flex items-center justify-between">
        {q}
        <span className="text-fg-muted transition group-open:rotate-180">▾</span>
      </summary>
      <p className="mt-3 text-sm text-fg-muted">{a}</p>
    </details>
  );
}
