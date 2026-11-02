# Vape Store — Inventory & Sales Management

Production-ready PERN stack application for a single-store vape shop: batch-level inventory,
FIFO checkout, POS + manual sales, payments, best sellers, reporting, role-based access and
database-backed audit logs.

- **Frontend:** React 19 · Vite · TypeScript · Tailwind CSS v4 · shadcn-style UI · Recharts
- **Backend:** Node.js · Express 5 · TypeScript · Zod · Supabase JS
- **Database & Auth:** Supabase PostgreSQL · Supabase Auth · RLS
- **Currency:** Philippine Peso (₱) · **Timezone:** Asia/Manila

---

## Project structure

```
vape-store/
├── frontend/                  # React SPA (Vercel)
│   └── src/
│       ├── components/        # UI primitives + layout
│       ├── contexts/          # Auth context
│       ├── hooks/
│       ├── layouts/           # (layout components live in components/layout)
│       ├── pages/             # dashboard, inventory, batches, pos, sales, ...
│       ├── services/          # API clients per domain
│       ├── lib/               # supabase, api, formatters
│       └── types/
├── backend/                   # Express API (Vercel Function)
│   ├── api/index.ts           # Vercel entrypoint
│   └── src/
│       ├── config/            # env + Supabase clients
│       ├── controllers/
│       ├── middleware/        # auth, validation, errors, rate limits
│       ├── routes/
│       ├── services/
│       ├── validators/        # (validation schemas live in shared/)
│       └── lib/
├── shared/                    # Types + Zod schemas used by both apps
├── supabase/
│   ├── migrations/            # schema, RLS, RPCs, reporting
│   ├── seed.sql               # settings row only (no mock data)
│   └── config.toml
└── .github/workflows/ci.yml
```

---

## Local setup

### 1. Install

```bash
npm install
```

### 2. Environment

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

`backend/.env`

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | Publishable / anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only. Used for creating staff accounts |
| `CORS_ORIGIN` | Comma separated allowed origins |

`frontend/.env`

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | Publishable / anon key |
| `VITE_API_URL` | Empty in dev (Vite proxies `/api` → `:4000`) |

> Never put the service role key in `frontend/` or any `VITE_*` variable.

### 3. Database

```bash
npx supabase login          # once
npx supabase link --project-ref <your-ref>
npx supabase db push        # applies supabase/migrations
```

The first user who signs in becomes **owner**. Public sign-up is disabled, so create the
owner account in the Supabase dashboard (Authentication → Users → Add user), then sign in.

### 4. Run

```bash
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:4000/api/v1/health

---

## Business rules

- **Roles:** owner, manager, cashier. Enforced in Express middleware **and** in RLS policies.
- **Checkout:** one RPC (`create_sale`) serves POS and manual sales. Client sends product IDs and
  quantities only — prices come from the database.
- **FIFO:** stock is consumed oldest batch first, or from a specific batch when one is supplied.
  Splits are recorded in `sale_item_allocations`.
- **Costs:** `supplier_price`, `selling_price`, `unit_cost` are snapshotted per batch/sale and never
  rewritten. Database triggers reject any attempt to edit batch cost, price or received quantity.
- **Cost privacy:** cashiers never receive supplier cost or gross profit. Stock counts come from a
  definer view that exposes quantities only, while cost views are RLS-protected.
- **Payments:** appended, never overwritten. Payment status is derived from recorded payments.
  Cashiers can only settle their own transactions.
- **Voids:** owner/manager only. Restores stock via `void_return` movements, voids payments, keeps
  the transaction for audit. No hard deletes on transactional tables.
- **Idempotency:** `create_sale` stores its response per `(key, user)`; retries return the original
  receipt.
- **Audit:** database triggers write every change to `audit_logs`.

### Role matrix

| Capability | Owner | Manager | Cashier |
|---|:--:|:--:|:--:|
| Dashboard / analytics | ✅ | ✅ | ✅ (no profit) |
| View inventory | ✅ | ✅ | ✅ (no cost) |
| Create/edit/archive products | ✅ | ✅ | — |
| Batches & suppliers | ✅ | ✅ | — |
| POS checkout | ✅ | ✅ | ✅ |
| Manual sales | ✅ | ✅ | — |
| View all sales | ✅ | ✅ | own only |
| Record payments | ✅ | ✅ | own sales |
| Void sales | ✅ | ✅ | — |
| View supplier cost / profit | ✅ | ✅ | — |
| Reports & exports | ✅ | ✅ | — |
| User management / settings / audit | ✅ | — | — |

---

## Scripts

```bash
npm run dev          # API + frontend
npm run typecheck    # all workspaces
npm run build        # shared → backend → frontend
npm run db:push      # supabase db push
```

### Database smoke tests

`supabase/tests/smoke.sql` exercises FIFO checkout, idempotent retries, oversell and
overpayment rejection, payment ownership, void restocking, cost masking for cashiers,
batch-price immutability and the audit trail. It runs inside a transaction and rolls
back, so it is safe against the live database:

```bash
npx supabase db query --linked -f supabase/tests/smoke.sql
```

An empty result means every assertion passed; any failure raises an exception.

---

## Deployment

The repository deploys as **one Vercel project with two services**, configured in the root
`vercel.json`:

| Service | Kind | Public path | Config |
|---|---|---|---|
| `frontend` | Vite static SPA | `/` (catch-all) | `root: frontend`, output `dist`, SPA fallback rewrite |
| `backend` | Express API | `/api/*` | `root: backend`, entrypoint `api/index.ts` |

Both services share the deployment domain, so the browser reaches the API through the `/api/*`
rewrite. The frontend therefore uses relative URLs (`/api/v1/...`) and `VITE_API_URL` must stay
**unset** in this setup. Set it only if the API is ever moved to a different origin.

`backend/vercel.json` is kept for deploying the API as its own standalone Vercel project
(Root Directory `backend/`). The single-project services deployment is driven entirely by the
root `vercel.json`.

Environment variables live at the project level (Settings → Environment Variables) and are shared
by both services:

| Variable | Used by | Notes |
|---|---|---|
| `SUPABASE_URL` | backend | Supabase project URL |
| `SUPABASE_ANON_KEY` | backend | public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | backend | server-only, never expose to the frontend |
| `CORS_ORIGIN` | backend | allowed origins, comma-separated; same-origin requests are always allowed |
| `VITE_SUPABASE_URL` | frontend (build time) | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | frontend (build time) | public anon key |

`VITE_*` values are inlined at build time, so redeploy after changing them.

No extra build step is needed for the shared package: the npm workspace runs its `prepare` script
during install and produces `shared/dist` before either service builds.

Deploy from the repository root with `vercel`, or connect the repository in the Vercel dashboard
and push to `main`.

Finally, in the Supabase dashboard keep **Authentication → Providers → Email → Allow new users to
sign up** disabled, and create the first owner under **Authentication → Users → Add user**.

---

## Notes

- Expenses, cash-drawer shifts, returns/refunds and VAT are intentionally out of scope for v1.
- Reports exclude voided sales.
- Daily/weekly/monthly buckets use `Asia/Manila`, not UTC.
