import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { getVersion } from "@tauri-apps/api/app";
import { useUpdater } from "@/hooks/useUpdater";
import {
  LayoutDashboard,
  FileText,
  PlusCircle,
  ShoppingCart,
  Settings,
  Users,
  Building2,
  LogOut,
  ChevronRight,
  Package,
  ClipboardList,
  BarChart3,
  RefreshCw,
} from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200/50 dark:border-amber-800",
  operator: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 border-sky-200/50 dark:border-sky-800",
  viewer: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 border-slate-200/50 dark:border-slate-600",
};

type NavSection = {
  label: string;
  items: { to: string; label: string; icon: React.ElementType; show: boolean }[];
};

export function Layout() {
  const { currentUser, logout, can } = useAuth();
  const { state: updaterState, checkForUpdates } = useUpdater();
  const [appVersion, setAppVersion] = useState("0.4.0");

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  const sections: NavSection[] = [
    {
      label: "Overview",
      items: [
        { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, show: true },
      ],
    },
    {
      label: "Export Documents",
      items: [
        { to: "/invoices", label: "Invoices", icon: FileText, show: true },
        { to: "/invoices/new", label: "Create Invoice", icon: PlusCircle, show: can("create_invoice") },
        { to: "/entries", label: "Entries", icon: ClipboardList, show: true },
        { to: "/customers", label: "Customers", icon: Building2, show: can("create_invoice") },
      ],
    },
    {
      label: "Procurement",
      items: [
        { to: "/purchase-orders", label: "Purchase Orders", icon: ShoppingCart, show: true },
      ],
    },
    {
      label: "Reports",
      items: [
        { to: "/reports/entries", label: "Entry Report", icon: BarChart3, show: true },
      ],
    },
    {
      label: "Administration",
      items: [
        { to: "/settings", label: "Settings", icon: Settings, show: can("access_settings") },
        { to: "/users", label: "User Management", icon: Users, show: can("manage_users") },
      ],
    },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="w-64 flex-shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col">
        <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-4">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shadow-sm">
            <Package className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0 leading-tight">
            <h1 className="text-sm font-semibold text-foreground tracking-tight">
              Export Invoice
            </h1>
            <div className="flex items-center gap-1.5">
              <p className="text-xs text-muted-foreground font-medium">
                v{appVersion}
              </p>
              <button
                type="button"
                onClick={
                  updaterState.phase === "idle" ||
                  updaterState.phase === "up-to-date" ||
                  updaterState.phase === "error" ||
                  updaterState.phase === "available"
                    ? checkForUpdates
                    : undefined
                }
                disabled={
                  updaterState.phase === "checking" ||
                  updaterState.phase === "downloading" ||
                  updaterState.phase === "done"
                }
                title={
                  updaterState.phase === "available"
                    ? `Update v${updaterState.version} available`
                    : updaterState.phase === "checking"
                      ? "Checking for updates…"
                      : updaterState.phase === "downloading"
                        ? updaterState.percent !== null
                          ? `Downloading update (${updaterState.percent}%)`
                          : "Downloading update…"
                        : updaterState.phase === "done"
                          ? "Relaunch the app to apply the update"
                          : "Check for updates"
                }
                className={cn(
                  "flex items-center justify-center rounded transition-colors",
                  updaterState.phase === "available"
                    ? "text-primary"
                    : updaterState.phase === "checking" ||
                        updaterState.phase === "downloading" ||
                        updaterState.phase === "done"
                      ? "text-muted-foreground/30 cursor-not-allowed"
                      : "text-muted-foreground/50 hover:text-muted-foreground"
                )}
              >
                <RefreshCw
                  size={11}
                  className={cn(
                    (updaterState.phase === "checking" ||
                      updaterState.phase === "downloading") &&
                      "animate-spin"
                  )}
                />
              </button>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto overflow-x-hidden">
          <div className="px-3 space-y-5">
            {sections.map((section) => {
              const visible = section.items.filter((i) => i.show);
              if (visible.length === 0) return null;
              return (
                <div key={section.label}>
                  <p className="px-3 mb-2 text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-[0.08em]">
                    {section.label}
                  </p>
                  <div className="space-y-0.5">
                    {visible.map(({ to, label, icon: Icon }) => (
                      <NavLink
                        key={to}
                        to={to}
                        end={to !== "/invoices" && to !== "/purchase-orders" && to !== "/entries" && to !== "/dashboard"}
                        className={({ isActive }) =>
                          cn(
                            "group flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 relative overflow-hidden",
                            isActive
                              ? "bg-primary/10 text-primary"
                              : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && (
                              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
                            )}
                            <span
                              className={cn(
                                "flex items-center justify-center w-8 h-8 rounded-md transition-colors",
                                isActive
                                  ? "bg-primary/15 text-primary"
                                  : "bg-muted/50 text-muted-foreground group-hover:bg-muted group-hover:text-foreground"
                              )}
                            >
                              <Icon size={17} strokeWidth={isActive ? 2 : 1.5} />
                            </span>
                            <span className="flex-1">{label}</span>
                            {isActive && (
                              <ChevronRight size={14} className="text-primary/60" />
                            )}
                          </>
                        )}
                      </NavLink>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          <ThemeToggle />
        </div>

        {currentUser && (
          <div className="p-3 border-t border-sidebar-border">
            <div className="flex items-center gap-3 p-2 rounded-lg bg-sidebar-accent border border-sidebar-border">
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center border border-sidebar-border">
                <span className="text-sm font-semibold text-muted-foreground">
                  {currentUser.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate text-foreground">{currentUser.name}</p>
                <span
                  className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border capitalize",
                    ROLE_COLORS[currentUser.role]
                  )}
                >
                  {currentUser.role}
                </span>
              </div>
              <button
                onClick={logout}
                title="Sign out"
                className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        )}
      </aside>

      <main className="flex-1 overflow-auto bg-muted/30">
        <Outlet />
      </main>

      <Toaster richColors position="top-right" />
    </div>
  );
}
