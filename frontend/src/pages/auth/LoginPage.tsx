import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Boxes, Eye, EyeOff, Loader2, LockKeyhole, Mail } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { FullScreenLoader } from "@/components/layout/guards";

export default function LoginPage() {
  const { session, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <FullScreenLoader label="Checking your session\u2026" />;
  if (session) return <Navigate to="/" replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await signIn(email.trim(), password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? "/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-line p-12 lg:flex">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(34,197,94,0.12),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(34,197,94,0.06),transparent_50%)]" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Boxes className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight">Vape Store</p>
            <p className="text-[11px] uppercase tracking-widest text-muted">
              Inventory &amp; Sales
            </p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            Every stick accounted for.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Batch-level inventory, FIFO checkout, payment tracking and profit reporting —
            all in one dark workspace built for the counter.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3 text-center">
            {[
              ["FIFO", "Stock rotation"],
              ["PHP", "Currency native"],
              ["RLS", "Role secured"],
            ].map(([value, label]) => (
              <div key={value} className="rounded-xl border border-line bg-surface/70 p-3">
                <p className="text-sm font-semibold text-accent">{value}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-[11px] text-muted">
          &copy; {new Date().getFullYear()} Vape Store. All rights reserved.
        </p>
      </div>

      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <Boxes className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">Vape Store</p>
              <p className="text-[11px] uppercase tracking-widest text-muted">Inventory &amp; Sales</p>
            </div>
          </div>

          <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-sm text-muted">
            Use the account provided by the store owner.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <Field label="Email address">
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="pl-9"
                />
              </div>
            </Field>

            <Field label="Password">
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
                  className="pl-9 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>

            {error ? (
              <div className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
                {error}
              </div>
            ) : null}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {submitting ? "Signing in\u2026" : "Sign in"}
            </Button>
          </form>

          <p className="mt-6 text-center text-[11px] text-muted">
            Accounts are created by the owner. Public sign-up is disabled.
          </p>
        </div>
      </div>
    </div>
  );
}
