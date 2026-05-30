import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="text-[20px] font-bold text-zinc-900 dark:text-zinc-50 leading-tight truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">{actions}</div>}
    </div>
  );
}
