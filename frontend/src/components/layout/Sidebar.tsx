import { NavLink } from "react-router-dom";
import {
  BarChart3,
  Boxes,
  LayoutDashboard,
  LogOut,
  Package,
  ReceiptText,
  Settings as SettingsIcon,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users,
  X,
} from "lucide-react";
import type { UserRole } from "@vape/shared";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { initials } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: UserRole[];
}

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["owner", "manager", "cashier"] },
  { to: "/inventory", label: "Inventory", icon: Package, roles: ["owner", "manager", "cashier"] },
  { to: "/batches", label: "Batches", icon: Boxes, roles: ["owner", "manager"] },
  { to: "/pos", label: "POS", icon: ShoppingCart, roles: ["owner", "manager", "cashier"] },
  { to: "/sales", label: "Sales", icon: ReceiptText, roles: ["owner", "manager", "cashier"] },
  { to: "/best-sellers", label: "Best Sellers", icon: TrendingUp, roles: ["owner", "manager", "cashier"] },
  { to: "/customers", label: "Customers", icon: Users, roles: ["owner", "manager", "cashier"] },
  { to: "/suppliers", label: "Suppliers", icon: Truck, roles: ["owner", "manager"] },
  { to: "/reports", label: "Reports", icon: BarChart3, roles: ["owner", "manager"] },
  { to: "/users", label: "User Management", icon: ShieldCheck, roles: ["owner"] },
  { to: "/settings", label: "Settings", icon: SettingsIcon, roles: ["owner"] },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, signOut } = useAuth();
  const role = profile?.role ?? "cashier";

  const items = NAV.filter((item) => item.roles.includes(role));

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-line bg-surface transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between gap-2 border-b border-line px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <Boxes className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight">Vape Store</p>
              <p className="text-[10px] uppercase tracking-widest text-muted">Inventory &amp; Sales</p>
            </div>
          </div>
          <button
            className="rounded-md p-1 text-muted hover:bg-surface-2 lg:hidden"
            onClick={onClose}
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-accent/10 font-medium text-accent"
                    : "text-muted hover:bg-surface-2 hover:text-foreground",
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-line p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-xs font-semibold text-accent">
              {initials(profile?.full_name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{profile?.full_name || "Staff"}</p>
              <p className="truncate text-[11px] capitalize text-muted">{profile?.role ?? ""}</p>
            </div>
            <button
              onClick={() => void signOut()}
              className="rounded-md p-1.5 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
