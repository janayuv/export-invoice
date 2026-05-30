import { cn } from "@/lib/utils";

interface LoadingSkeletonProps {
  rows?: number;
  className?: string;
}

export function LoadingSkeleton({ rows = 5, className }: LoadingSkeletonProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-9 rounded-md bg-zinc-100 dark:bg-zinc-800 animate-pulse"
          style={{ opacity: 1 - i * 0.12 }}
        />
      ))}
    </div>
  );
}
