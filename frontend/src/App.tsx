import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute, RoleGate } from "@/components/layout/guards";
import LoginPage from "@/pages/auth/LoginPage";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import InventoryPage from "@/pages/inventory/InventoryPage";
import BatchesPage from "@/pages/batches/BatchesPage";
import PosPage from "@/pages/pos/PosPage";
import SalesPage from "@/pages/sales/SalesPage";
import BestSellersPage from "@/pages/best-sellers/BestSellersPage";
import CustomersPage from "@/pages/customers/CustomersPage";
import SuppliersPage from "@/pages/suppliers/SuppliersPage";
import ReportsPage from "@/pages/reports/ReportsPage";
import UsersPage from "@/pages/settings/UsersPage";
import SettingsPage from "@/pages/settings/SettingsPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route
          path="batches"
          element={
            <RoleGate roles={["owner", "manager"]}>
              <BatchesPage />
            </RoleGate>
          }
        />
        <Route path="pos" element={<PosPage />} />
        <Route path="sales" element={<SalesPage />} />
        <Route path="best-sellers" element={<BestSellersPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route
          path="suppliers"
          element={
            <RoleGate roles={["owner", "manager"]}>
              <SuppliersPage />
            </RoleGate>
          }
        />
        <Route
          path="reports"
          element={
            <RoleGate roles={["owner", "manager"]}>
              <ReportsPage />
            </RoleGate>
          }
        />
        <Route
          path="users"
          element={
            <RoleGate roles={["owner"]}>
              <UsersPage />
            </RoleGate>
          }
        />
        <Route
          path="settings"
          element={
            <RoleGate roles={["owner"]}>
              <SettingsPage />
            </RoleGate>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
