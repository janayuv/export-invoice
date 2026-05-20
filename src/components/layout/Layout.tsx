import { NavLink, Outlet } from "react-router-dom";
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
} from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
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
      <aside className="w-64 flex-shrink-0 bg-gradient-to-b from-card to-card/95 border-r border-border/60 flex flex-col relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/3 via-transparent to-transparent pointer-events-none" />
        
        <div className="relative p-5 border-b border-border/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-sm">
              <Package className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground tracking-tight">
                Export Invoice
              </h1>
              <p className="text-xs text-muted-foreground/70 font-medium">v1.0.0</p>
            </div>
          </div>
        </div>

        <nav className="relative flex-1 py-4 overflow-y-auto overflow-x-hidden">
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
                              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
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

        {currentUser && (
          <div className="relative p-3 border-t border-border/50 bg-muted/20">
            <div className="flex items-center gap-3 p-2 rounded-lg bg-card/60 border border-border/30">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-muted-foreground/20 to-muted-foreground/10 flex items-center justify-center border border-border/50">
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

      <main className="flex-1 overflow-auto bg-background/50">
        <Outlet />
      </main>

      <Toaster richColors position="top-right" />
    </div>
  );
}
