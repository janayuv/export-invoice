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
} from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  operator: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  viewer: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
};

type NavSection = {
  label: string;
  items: { to: string; label: string; icon: React.ElementType; show: boolean }[];
};

export function Layout() {
  const { currentUser, logout, can } = useAuth();

  const sections: NavSection[] = [
    {
      label: "Export",
      items: [
        { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, show: true },
        { to: "/invoices", label: "Invoices", icon: FileText, show: true },
        { to: "/invoices/new", label: "New Invoice", icon: PlusCircle, show: can("create_invoice") },
        { to: "/customers", label: "Customers", icon: Building2, show: can("create_invoice") },
      ],
    },
    {
      label: "Purchase",
      items: [
        { to: "/purchase-orders", label: "Purchase Orders", icon: ShoppingCart, show: true },
      ],
    },
    {
      label: "Admin",
      items: [
        { to: "/settings", label: "Settings", icon: Settings, show: can("access_settings") },
        { to: "/users", label: "Users", icon: Users, show: can("manage_users") },
      ],
    },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="w-56 flex-shrink-0 border-r bg-card flex flex-col">
        <div className="p-4 border-b">
          <h1 className="text-sm font-bold text-primary leading-tight">
            Export Invoice
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Invoice Manager</p>
        </div>

        <nav className="flex-1 p-2 space-y-3 overflow-y-auto">
          {sections.map((section) => {
            const visible = section.items.filter((i) => i.show);
            if (visible.length === 0) return null;
            return (
              <div key={section.label}>
                <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                  {section.label}
                </p>
                <div className="space-y-0.5">
                  {visible.map(({ to, label, icon: Icon }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={to !== "/invoices" && to !== "/purchase-orders"}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground font-medium"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        )
                      }
                    >
                      <Icon size={16} />
                      {label}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Current user panel */}
        {currentUser && (
          <div className="p-3 border-t">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{currentUser.name}</p>
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize",
                    ROLE_COLORS[currentUser.role]
                  )}
                >
                  {currentUser.role}
                </span>
              </div>
              <button
                onClick={logout}
                title="Sign out"
                className="ml-2 p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
        )}
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      <Toaster richColors position="top-right" />
    </div>
  );
}
