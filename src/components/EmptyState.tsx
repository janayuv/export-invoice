import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3 py-16 text-center", className)}>
      <Icon size={28} strokeWidth={1.5} className="text-zinc-300 dark:text-zinc-700" />
      <div>
        <p className="text-[13px] font-semibold text-zinc-600 dark:text-zinc-400">{title}</p>
        {description && (
          <p className="text-[11px] mt-0.5 text-zinc-400 dark:text-zinc-600">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
