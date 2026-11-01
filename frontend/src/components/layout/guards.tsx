import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { UserRole } from "@vape/shared";
import { useAuth } from "@/contexts/AuthContext";
import { Boxes } from "lucide-react";

export function FullScreenLoader({ label = "Loading workspace\u2026" }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas text-muted">
      <div className="flex h-12 w-12 animate-pulse items-center justify-center rounded-xl border border-line bg-surface text-accent">
        <Boxes className="h-5 w-5" />
      </div>
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader />;

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas px-6 text-center">
        <p className="text-sm font-medium text-foreground">Your account is not provisioned.</p>
        <p className="max-w-sm text-xs text-muted">
          Ask the owner to activate your profile, then sign in again.
        </p>
      </div>
    );
  }

  if (!profile.is_active) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas px-6 text-center">
        <p className="text-sm font-medium text-danger">This account has been deactivated.</p>
        <p className="max-w-sm text-xs text-muted">Contact the store owner to restore access.</p>
      </div>
    );
  }

  return <>{children}</>;
}

export function RoleGate({
  roles,
  children,
}: {
  roles: UserRole[];
  children: ReactNode;
}) {
  const { profile } = useAuth();

  if (!profile || !roles.includes(profile.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
