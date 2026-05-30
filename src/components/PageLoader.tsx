import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageLoaderProps {
  message?: string;
  className?: string;
  fullScreen?: boolean;
}

export function PageLoader({
  message = "Loading…",
  className,
  fullScreen = false,
}: PageLoaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 text-[12px] text-zinc-400 dark:text-zinc-600",
        fullScreen ? "min-h-screen" : "py-16",
        className
      )}
    >
      <Loader2 size={20} className="animate-spin text-indigo-400" />
      <span>{message}</span>
    </div>
  );
}
