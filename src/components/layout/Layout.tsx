import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { getVersion } from "@tauri-apps/api/app";
import { useUpdater } from "@/hooks/useUpdater";
import { useTheme } from "next-themes";
import {
  LayoutDashboard,
  FileText,
  PlusCircle,
  ShoppingCart,
  Settings,
  Users,
  Building2,
  LogOut,
  Package,
  ClipboardList,
  BarChart3,
  Sun,
  Moon,
  RefreshCw,
  ChevronLeft,
  Database,
  Activity,
  UserCheck,
  HeartPulse,
  ShieldCheck,
  Lock,
  Zap,
  Gauge,
  Bot,
} from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-amber-400/15 text-amber-400",
  operator: "bg-blue-400/15 text-blue-400",
  viewer: "bg-zinc-500/20 text-zinc-400",
};

type NavSection = {
  label: string;
  items: { to: string; label: string; icon: React.ElementType; show: boolean }[];
};

export function Layout() {
  const { currentUser, logout, can } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const { state: updaterState, checkForUpdates } = useUpdater();
  const [appVersion, setAppVersion] = useState("0.4.0");
  const [mounted, setMounted] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebar_collapsed") === "true"; }
    catch { return false; }
  });

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { getVersion().then(setAppVersion).catch(() => {}); }, []);
  useEffect(() => {
    try { localStorage.setItem("sidebar_collapsed", String(collapsed)); }
    catch {}
  }, [collapsed]);

  const isDark = mounted && resolvedTheme === "dark";

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
    {
      label: "Admin Center",
      items: [
        { to: "/admin/database-management", label: "Database Management", icon: Database,    show: can("access_settings") },
        { to: "/admin/activity-log",        label: "Activity Log",        icon: Activity,    show: can("access_settings") },
        { to: "/admin/user-activity",       label: "User Activity",       icon: UserCheck,   show: can("access_settings") },
        { to: "/admin/system-health",       label: "System Health",       icon: HeartPulse,  show: can("access_settings") },
        { to: "/admin/security-center",     label: "Security Center",     icon: ShieldCheck, show: can("access_settings") },
        { to: "/admin/roles-permissions",   label: "Roles & Permissions", icon: Lock,        show: can("access_settings") },
        { to: "/admin/automation-center",   label: "Automation Center",   icon: Zap,         show: can("access_settings") },
        { to: "/admin/operations-center",   label: "Operations Center",   icon: Gauge,       show: can("access_settings") },
        { to: "/admin/system-agent",        label: "System Agent",        icon: Bot,         show: can("access_settings") },
      ],
    },
  ];

  // Base classes shared by nav items and the bottom-area buttons
  const navItemBase = cn(
    "flex items-center rounded-md mx-1.5 my-px text-[12px]",
    "transition-[background,color] duration-100",
    collapsed ? "px-2 py-2 justify-center" : "gap-2 px-2 py-1.5"
  );

  const navItemInactive =
    "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-50";

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-100 dark:bg-zinc-950">
      {/* ── Sidebar ── */}
      <aside
        className={cn(
          "flex-shrink-0 flex flex-col",
          "border-r border-zinc-200 dark:border-zinc-800",
          "transition-[width] duration-[220ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
          "overflow-hidden bg-white dark:bg-[#0f0f12]"
        )}
        style={{ width: collapsed ? 52 : 218 }}
      >
        {/* ── Logo area (52px tall) ── */}
        <div
          className={cn(
            "flex h-[52px] flex-shrink-0 items-center",
            "border-b border-zinc-200 dark:border-zinc-800",
            collapsed ? "justify-center px-0" : "gap-2.5 px-3"
          )}
        >
          {/* Icon box — clicking it expands when collapsed */}
          <button
            type="button"
            onClick={collapsed ? () => setCollapsed(false) : undefined}
            className={cn(
              "w-[27px] h-[27px] rounded-[7px]",
              "bg-indigo-400/15 flex items-center justify-center flex-shrink-0",
              collapsed
                ? "cursor-pointer hover:bg-indigo-400/25 transition-colors"
                : "cursor-default"
            )}
            title={collapsed ? "Expand sidebar" : "Export Invoice app icon"}
            aria-label={collapsed ? "Expand sidebar" : undefined}
          >
            <Package size={14} className="text-indigo-400" />
          </button>

          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold leading-none text-zinc-900 dark:text-zinc-50">
                  Export Invoice
                </div>
                <div className="flex items-center gap-1 mt-[3px]">
                  <span className="text-[10px] leading-none text-zinc-400 dark:text-zinc-600">
                    v{appVersion}
                  </span>
                  {/* Update check */}
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
                    aria-label={
                      updaterState.phase === "available"
                        ? `Update version ${updaterState.version} available`
                        : updaterState.phase === "checking"
                          ? "Checking for updates"
                          : updaterState.phase === "downloading"
                            ? "Downloading update"
                            : updaterState.phase === "done"
                              ? "Relaunch to apply update"
                              : "Check for updates"
                    }
                    className={cn(
                      "flex items-center justify-center rounded transition-colors",
                      updaterState.phase === "available"
                        ? "text-indigo-400"
                        : updaterState.phase === "checking" ||
                            updaterState.phase === "downloading" ||
                            updaterState.phase === "done"
                          ? "text-zinc-400/30 cursor-not-allowed"
                          : "text-zinc-400/50 hover:text-zinc-400"
                    )}
                  >
                    <RefreshCw
                      size={10}
                      className={cn(
                        (updaterState.phase === "checking" ||
                          updaterState.phase === "downloading") &&
                          "animate-spin"
                      )}
                    />
                  </button>
                </div>
              </div>

              {/* Collapse toggle */}
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="w-5 h-5 flex items-center justify-center rounded flex-shrink-0 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <ChevronLeft size={13} />
              </button>
            </>
          )}
        </div>

        {/* ── Nav sections ── */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2">
          {sections.map((section) => {
            const visible = section.items.filter((i) => i.show);
            if (!visible.length) return null;
            return (
              <div key={section.label}>
                {!collapsed && (
                  <div className="px-[14px] pt-[10px] pb-[3px] text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-600">
                    {section.label}
                  </div>
                )}
                {visible.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={
                      to !== "/invoices" &&
                      to !== "/purchase-orders" &&
                      to !== "/entries" &&
                      to !== "/dashboard"
                    }
                    title={collapsed ? label : undefined}
                    className={({ isActive }) =>
                      cn(
                        navItemBase,
                        isActive
                          ? "bg-indigo-400/15 text-indigo-400 font-semibold"
                          : navItemInactive
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span className="w-5 flex items-center justify-center flex-shrink-0">
                          <Icon size={14} />
                        </span>
                        {!collapsed && (
                          <>
                            <span className="flex-1 truncate">{label}</span>
                            {isActive && (
                              <span className="w-[5px] h-[5px] rounded-full bg-indigo-400 flex-shrink-0" />
                            )}
                          </>
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        {/* ── Bottom: theme toggle ── */}
        <div className="border-t border-zinc-200 dark:border-zinc-800 py-1">
          <button
            type="button"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            title={isDark ? "Light Mode" : "Dark Mode"}
            className={cn(navItemBase, navItemInactive, "w-[calc(100%-12px)]")}
          >
            <span className="w-5 flex items-center justify-center flex-shrink-0">
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
            </span>
            {!collapsed && (
              <span>{isDark ? "Light Mode" : "Dark Mode"}</span>
            )}
          </button>
        </div>

        {/* ── User area ── */}
        {currentUser && (
          <div className="border-t border-zinc-200 dark:border-zinc-800 p-[6px]">
            <div
              className={cn(
                "flex items-center gap-2 px-[6px] py-[6px] rounded-md",
                "bg-zinc-100 dark:bg-zinc-800",
                collapsed && "justify-center"
              )}
            >
              {/* Letter avatar */}
              <div className="w-[26px] h-[26px] rounded-full bg-indigo-400/15 flex items-center justify-center flex-shrink-0">
                <span className="text-[11px] font-semibold text-indigo-400">
                  {currentUser.name.charAt(0).toUpperCase()}
                </span>
              </div>

              {!collapsed && (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold leading-none text-zinc-900 dark:text-zinc-50 truncate">
                      {currentUser.name}
                    </p>
                    <span
                      className={cn(
                        "inline-flex items-center px-1.5 py-px rounded text-[9px] font-semibold capitalize mt-0.5",
                        ROLE_BADGE[currentUser.role] ?? "bg-zinc-500/20 text-zinc-400"
                      )}
                    >
                      {currentUser.role}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={logout}
                    aria-label="Sign out"
                    title="Sign out"
                    className="p-1 rounded flex-shrink-0 text-zinc-400 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                  >
                    <LogOut size={12} />
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden bg-zinc-50 dark:bg-zinc-950">
        <Outlet />
      </main>

      <Toaster richColors position="top-right" />
    </div>
  );
}
