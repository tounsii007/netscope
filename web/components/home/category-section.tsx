import { ToolCard } from "@/components/home/tool-card";
import type { LucideIcon } from "lucide-react";

export type CategoryAccent = "brand" | "cyan" | "violet" | "success";

export interface CategoryTool {
  href: string;
  title: string;
  desc: string;
  icon: LucideIcon;
}

/**
 * Single category band on the landing page: heading + 5-column grid
 * of {@link ToolCard}s. Each band has an accent color that tints both
 * the heading underline and every card's icon, so users can scan the
 * page by colour as well as text.
 */
export function CategorySection({
  title,
  caption,
  accent,
  tools,
  icon: Icon,
}: {
  title: string;
  caption: string;
  accent: CategoryAccent;
  tools: CategoryTool[];
  icon: LucideIcon;
}) {
  const accentText =
    accent === "cyan"
      ? "text-cyan-soft"
      : accent === "violet"
        ? "text-violet-soft"
        : accent === "success"
          ? "text-success"
          : "text-brand";
  const accentBar =
    accent === "cyan"
      ? "from-cyan-brand to-transparent"
      : accent === "violet"
        ? "from-violet-brand to-transparent"
        : accent === "success"
          ? "from-success to-transparent"
          : "from-brand to-transparent";

  return (
    <section aria-labelledby={`cat-${title}`} className="space-y-4">
      <header className="flex items-center gap-3">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg bg-bg-elevated ring-1 ring-border ${accentText}`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="flex-1 min-w-0">
          <h2 id={`cat-${title}`} className="text-base font-semibold tracking-tight sm:text-lg">
            {title}
          </h2>
          <p className="text-xs text-fg-muted sm:text-sm">{caption}</p>
        </div>
        <div
          className={`hidden h-px flex-1 max-w-[40%] bg-gradient-to-r ${accentBar} sm:block`}
          aria-hidden="true"
        />
      </header>

      <div className="grid gap-3 stagger sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 sm:gap-4">
        {tools.map((tool) => (
          <ToolCard
            key={tool.href}
            href={tool.href}
            title={tool.title}
            desc={tool.desc}
            icon={tool.icon}
            accent={accent}
          />
        ))}
      </div>
    </section>
  );
}
