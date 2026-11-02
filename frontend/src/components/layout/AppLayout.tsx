import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Menu, Store } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { ROLE_LABELS } from "@vape/shared";

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { profile } = useAuth();
  const location = useLocation();

  const title =
    {
      "/": "Dashboard",
      "/inventory": "Inventory",
      "/batches": "Batches",
      "/pos": "Point of Sale",
      "/sales": "Sales",
      "/best-sellers": "Best Sellers",
      "/customers": "Customers",
      "/suppliers": "Suppliers",
      "/reports": "Reports",
      "/users": "User Management",
      "/settings": "Settings",
    }[location.pathname] ?? "Vape Store";

  const mainRef = useRef<HTMLElement>(null);

  // Keep each page starting at the top when navigating (the content area
  // is its own scroll container now, so the browser won't do it for us).
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur lg:px-8">
          <div className="flex items-center gap-3">
            <button
              className="rounded-md p-2 text-muted hover:bg-surface-2 lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted">Workspace</p>
              <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-muted sm:flex">
              <Store className="h-3.5 w-3.5" />
              <span>{profile ? ROLE_LABELS[profile.role] : "\u2014"}</span>
            </div>
          </div>
        </header>

        <main
          ref={mainRef}
          className="mx-auto w-full max-w-[1600px] flex-1 overflow-y-auto p-4 lg:p-8"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
