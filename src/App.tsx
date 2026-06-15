import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Database } from "lucide-react";
import { validateSchema, clearDbPath, getStoredDbPath } from "@/lib/db";
import { Layout } from "@/components/layout/Layout";
import { Dashboard } from "@/routes/Dashboard";
import { Settings } from "@/routes/Settings";
import { InvoiceList } from "@/routes/InvoiceList";
import { InvoiceNew } from "@/routes/InvoiceNew";
import { InvoiceDetail } from "@/routes/InvoiceDetail";
import { LoginScreen } from "@/routes/LoginScreen";
import { SetupAdmin } from "@/routes/SetupAdmin";
import { UserManagement } from "@/routes/UserManagement";
import { CustomerManagement } from "@/routes/CustomerManagement";
import { PurchaseOrderList } from "@/routes/PurchaseOrderList";
import { PurchaseOrderNew } from "@/routes/PurchaseOrderNew";
import { PurchaseOrderDetail } from "@/routes/PurchaseOrderDetail";
import { EntryList } from "@/routes/EntryList";
import { EntryNew } from "@/routes/EntryNew";
import { ReportEntries } from "@/routes/ReportEntries";
import { DatabaseManagement } from "@/admin/pages/DatabaseManagement";
import { ActivityLog }         from "@/admin/pages/ActivityLog";
import { UserActivity }        from "@/admin/pages/UserActivity";
import { SystemHealth }        from "@/admin/pages/SystemHealth";
import { SecurityCenter }      from "@/admin/pages/SecurityCenter";
import { RolesPermissions }    from "@/admin/pages/RolesPermissions";
import { AutomationCenter }    from "@/admin/pages/AutomationCenter";
import { OperationCenter }     from "@/admin/pages/OperationCenter";
import { SystemAgent }         from "@/admin/pages/SystemAgent";
import { LogViewer }           from "@/admin/pages/LogViewer";
import { ErrorBoundary }       from "@/components/ErrorBoundary";
import { PageLoader }          from "@/components/PageLoader";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import type { Permission } from "@/lib/auth";
import type { ReactNode } from "react";

function AuthGate({ children }: { children: ReactNode }) {
  const { currentUser, isLoading, needsSetup } = useAuth();
  if (isLoading) return <PageLoader fullScreen message="Signing in…" />;
  if (needsSetup) return <SetupAdmin />;
  if (!currentUser) return <LoginScreen />;
  return <>{children}</>;
}

function PermissionGuard({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const { can } = useAuth();
  if (!can(permission)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

// ── DB-corruption recovery screen ─────────────────────────────────────────────
function DbErrorScreen({ hasCustomDb }: { hasCustomDb: boolean }) {
  const [resetting, setResetting] = useState(false);

  async function handleReset() {
    setResetting(true);
    try {
      await clearDbPath();
      window.location.reload();
    } catch {
      setResetting(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: "#09090b" }}
    >
      <div
        className="w-full rounded-xl p-7 space-y-5 text-center"
        style={{ maxWidth: 420, background: "#18181b", border: "1px solid #27272a" }}
      >
        {/* Icon */}
        <div
          className="flex items-center justify-center w-12 h-12 rounded-full mx-auto"
          style={{ background: "rgba(239,68,68,0.12)" }}
        >
          <Database size={22} style={{ color: "#f87171" }} />
        </div>

        {/* Message */}
        <div className="space-y-1.5">
          <h1 className="text-[18px] font-bold text-zinc-50">Database Corrupted</h1>
          <p className="text-[12px] text-zinc-400 leading-relaxed">
            The database file could not be read (SQLite error&nbsp;11 — disk image malformed).
            This usually means the file was truncated or written incorrectly.
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          {hasCustomDb && (
            <button
              onClick={handleReset}
              disabled={resetting}
              className="w-full rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white transition-opacity disabled:opacity-50"
              style={{ background: "#818cf8" }}
            >
              {resetting ? "Resetting…" : "Reset to Default Database & Restart"}
            </button>
          )}
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            {hasCustomDb
              ? "This will discard the custom DB path and reload using the bundled database."
              : "Delete or replace the database file in your app data folder, then restart. You can also restore a backup using the Settings page after the app loads."}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [dbError, setDbError] = useState(false);

  useEffect(() => {
    validateSchema().catch((e) => {
      const msg = String(e);
      console.error("validateSchema failed:", e);
      if (msg.includes("malformed") || msg.includes("code: 11")) {
        setDbError(true);
      }
    });
  }, []);

  if (dbError) {
    return <DbErrorScreen hasCustomDb={!!getStoredDbPath()} />;
  }

  return (
    <AuthProvider>
      <ErrorBoundary>
        <BrowserRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <AuthGate>
            <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route
                path="settings"
                element={
                  <PermissionGuard permission="access_settings">
                    <Settings />
                  </PermissionGuard>
                }
              />

              {/* Export Invoices */}
              <Route path="invoices" element={<InvoiceList />} />
              <Route
                path="invoices/new"
                element={
                  <PermissionGuard permission="create_invoice">
                    <InvoiceNew />
                  </PermissionGuard>
                }
              />
              <Route path="invoices/:id" element={<InvoiceDetail />} />
              <Route
                path="invoices/:id/edit"
                element={
                  <PermissionGuard permission="edit_invoice">
                    <InvoiceNew />
                  </PermissionGuard>
                }
              />

              {/* Purchase Orders */}
              <Route path="purchase-orders" element={<PurchaseOrderList />} />
              <Route
                path="purchase-orders/new"
                element={
                  <PermissionGuard permission="create_purchase_order">
                    <PurchaseOrderNew />
                  </PermissionGuard>
                }
              />
              <Route path="purchase-orders/:id" element={<PurchaseOrderDetail />} />
              <Route
                path="purchase-orders/:id/edit"
                element={
                  <PermissionGuard permission="edit_invoice">
                    <PurchaseOrderNew />
                  </PermissionGuard>
                }
              />

              {/* Entries */}
              <Route path="entries" element={<EntryList />} />
              <Route
                path="entries/new"
                element={
                  <PermissionGuard permission="create_invoice">
                    <EntryNew />
                  </PermissionGuard>
                }
              />
              <Route
                path="entries/:id/edit"
                element={
                  <PermissionGuard permission="edit_invoice">
                    <EntryNew />
                  </PermissionGuard>
                }
              />

              {/* Reports */}
              <Route path="reports/entries" element={<ReportEntries />} />

              {/* Masters */}
              <Route path="customers" element={<CustomerManagement />} />

              {/* Admin */}
              <Route
                path="users"
                element={
                  <PermissionGuard permission="manage_users">
                    <UserManagement />
                  </PermissionGuard>
                }
              />

              {/* Admin Center */}
              <Route path="admin/database-management" element={<PermissionGuard permission="access_settings"><DatabaseManagement /></PermissionGuard>} />
              <Route path="admin/activity-log"        element={<PermissionGuard permission="access_settings"><ActivityLog /></PermissionGuard>} />
              <Route path="admin/user-activity"       element={<PermissionGuard permission="access_settings"><UserActivity /></PermissionGuard>} />
              <Route path="admin/system-health"       element={<PermissionGuard permission="access_settings"><SystemHealth /></PermissionGuard>} />
              <Route path="admin/security-center"     element={<PermissionGuard permission="access_settings"><SecurityCenter /></PermissionGuard>} />
              <Route path="admin/roles-permissions"   element={<PermissionGuard permission="access_settings"><RolesPermissions /></PermissionGuard>} />
              <Route path="admin/automation-center"   element={<PermissionGuard permission="access_settings"><AutomationCenter /></PermissionGuard>} />
              <Route path="admin/operations-center"   element={<PermissionGuard permission="access_settings"><OperationCenter /></PermissionGuard>} />
              <Route path="admin/system-agent"        element={<PermissionGuard permission="access_settings"><SystemAgent /></PermissionGuard>} />
              <Route path="admin/log-viewer"          element={<PermissionGuard permission="access_settings"><LogViewer /></PermissionGuard>} />
            </Route>
            </Routes>
          </AuthGate>
        </BrowserRouter>
      </ErrorBoundary>
    </AuthProvider>
  );
}
