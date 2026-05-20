import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

type Accent = "brand" | "cyan" | "violet" | "success";

const ACCENTS: Record<Accent, { tint: string; ring: string; text: string }> = {
  brand:   { tint: "bg-brand/10",        ring: "ring-brand/30",        text: "text-brand"      },
  cyan:    { tint: "bg-cyan-brand/10",   ring: "ring-cyan-brand/30",   text: "text-cyan-soft"  },
  violet:  { tint: "bg-violet-brand/10", ring: "ring-violet-brand/30", text: "text-violet-soft" },
  success: { tint: "bg-success/10",      ring: "ring-success/30",      text: "text-success"    },
};

/**
 * Polished tool card used on the landing grid. The gradient hover
 * border is rendered by the `.card-premium` utility (in globals.css)
 * via a masked ::before — that keeps it purely CSS and avoids the
 * extra wrapper divs the older "1px gradient + bg" trick required.
 *
 * The arrow on the right slides + fades in on hover/focus and is
 * `aria-hidden` because the link itself is keyboard-accessible.
 */
export function ToolCard({
  href,
  title,
  desc,
  icon: Icon,
  accent = "brand",
}: {
  href: string;
  title: string;
  desc: string;
  icon: LucideIcon;
  accent?: Accent;
}) {
  const a = ACCENTS[accent];
  return (
    <Link
      href={href}
      className="card-premium group block focus:outline-none"
    >
      <div className="flex items-start justify-between">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${a.tint} ring-1 ${a.ring} transition group-hover:scale-110`}
        >
          <Icon className={`h-5 w-5 ${a.text}`} aria-hidden="true" />
        </span>
        <ArrowUpRight
          className="h-4 w-4 -translate-x-1 text-fg-subtle opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100"
          aria-hidden="true"
        />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-fg sm:text-base">
        {title}
      </h3>
      <p className="mt-1 line-clamp-2 text-xs text-fg-muted sm:text-sm">
        {desc}
      </p>
    </Link>
  );
}
