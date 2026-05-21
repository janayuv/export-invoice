import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "system", icon: Monitor, label: "System" },
  { value: "dark", icon: Moon, label: "Dark" },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // next-themes only knows the resolved value after mount; avoid a wrong-icon flash
  useEffect(() => setMounted(true), []);

  return (
    <div className="grid grid-cols-3 gap-1 rounded-lg border border-sidebar-border bg-muted/40 p-1">
      {OPTIONS.map(({ value, icon: Icon, label }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            title={label}
            aria-label={`Switch to ${label.toLowerCase()} theme`}
            aria-pressed={active}
            className={cn(
              "flex items-center justify-center h-7 rounded-md transition-colors",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon size={15} />
          </button>
        );
      })}
    </div>
  );
}
