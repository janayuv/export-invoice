import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import type { Permission } from "@/lib/auth";
import type { ReactNode } from "react";

function AuthGate({ children }: { children: ReactNode }) {
  const { currentUser, isLoading, needsSetup } = useAuth();
  if (isLoading) return null;
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

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
                  <PermissionGuard permission="create_invoice">
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
            </Route>
          </Routes>
        </AuthGate>
      </BrowserRouter>
    </AuthProvider>
  );
}
