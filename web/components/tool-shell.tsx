import { cn } from "@/lib/cn";

export function ToolShell({
  title, subtitle, icon, children, className,
}: {
  title: string; subtitle: string; icon: React.ReactNode;
  children: React.ReactNode; className?: string;
}) {
  return (
    <section className={cn("space-y-6 animate-slide-up", className)}>
      <header className="flex items-start gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand">
          {icon}
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-fg-muted">{subtitle}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

export function ResultCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("card", className)}>{children}</div>;
}

export function Spinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
  );
}
