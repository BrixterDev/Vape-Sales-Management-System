# Build Journal - Vape Store Inventory & Sales System

A retrospective of how this system was built, every problem we hit, how it was fixed,
and the rules to carry into the next project.

> Audience: future you, and anyone starting a similar PERN / Supabase + Vercel app.
> Read section 6 and 7 before starting a new system.
>
> Last updated: 2026-11-06

---

## 1. What the system is

A production-ready, single-store inventory and sales system for a vape shop.

| Area | Choice |
|---|---|
| Frontend | React 19, Vite 8, TypeScript, Tailwind CSS v4, shadcn-style UI, Recharts |
| Backend | Node.js, Express 5, TypeScript, Zod, Supabase JS |
| Database / Auth | Supabase PostgreSQL, Supabase Auth, Row Level Security |
| Shared code | `@vape/shared` workspace: types + Zod schemas + role helpers |
| Money | Philippine Peso (PHP), timezone `Asia/Manila` |
| Roles | `owner`, `manager`, `cashier` |
| Deploy | One Vercel project, two services (`backend`, `frontend`) |

Core business rules baked into the database:

- Stock is **batch-level**. Checkout consumes oldest batch first (FIFO), or a chosen batch.
- One transaction RPC (`create_sale`) serves POS and manual sales. Client sends product IDs
  and quantities only; **prices always come from the database**.
- Batch costs, selling prices and received quantities are **immutable** after creation.
- Payments are **appended**, never overwritten. Payment status is derived.
- Voids restore stock and keep the transaction for audit - no hard deletes.
- Every change is written to `audit_logs` by triggers.
- Cashiers never receive supplier cost or profit. Stock counts come from a definer view
  that exposes quantities only.

---

## 2. Final architecture

```
Browser (React SPA)
   |  fetch /api/v1/*   (relative URL, same origin)
   v
Vercel routing (root vercel.json)
   |-- /api/*  --> backend service  (Express, entrypoint api/index.ts)
   |-- /*      --> frontend service (static Vite build + SPA fallback)

Express
   |  forwards the caller's JWT
   v
Supabase (PostgreSQL + Auth + PostgREST)
   |  RLS + SECURITY DEFINER RPCs enforce every rule
```

### Workspace layout

```
vape-store/
  package.json            # npm workspaces + ordered build/typecheck scripts
  vercel.json             # single project, services: backend + frontend
  shared/                 # Zod schemas + types shared by API and UI
  backend/
    api/index.ts          # Vercel entrypoint (exports the Express app)
    src/app.ts            # createApp(): middleware, CORS, routes
    src/server.ts         # local only: createApp().listen()
    src/config/           # env validation, Supabase clients
    src/middleware/       # auth, validation, errors, rate limits
    src/routes|controllers|services/
  frontend/
    src/lib/api.ts        # fetch wrapper: relative /api/v1 + Bearer token
    src/lib/supabase.ts   # browser client (anon key only)
    src/pages|components|services|contexts/
  supabase/
    migrations/           # schema, functions, RLS, views (14 migrations)
    tests/smoke.sql       # transactional DB test suite
  .github/workflows/ci.yml
  docs/BUILD-JOURNAL.md
```

### Database objects

Tables: `profiles`, `brands`, `products`, `suppliers`, `batches`, `batch_items`,
`customers`, `sales`, `sale_items`, `sale_item_allocations`, `payments`,
`stock_movements`, `audit_logs`, `idempotency_keys`, `settings`.

Key RPCs: `create_sale`, `edit_sale`, `void_sale`, `add_payment`, `adjust_stock`,
`create_batch`, `delete_batch`, `update_sale_details`, `best_sellers`, `sales_report`,
`dashboard_metrics`, `outstanding_report`, `cashier_performance`,
`pos_active_batches`, `pos_batch_items`.

Key views: `v_product_stock` (definer, quantities only), `v_product_stock_costs`
(RLS-protected), `v_batch_summary`, `v_sale_balances`, `v_customer_balances`,
`v_inventory_value`, `v_inventory_summary_public`, `v_sale_items`, `v_sale_allocations`.

---

## 3. How we built it (phase by phase)

### Phase 0 - Foundation

1. Created the npm workspace monorepo: `shared`, `backend`, `frontend`.
2. Root scripts run in dependency order:
   `shared build -> backend typecheck -> frontend build`.
3. `shared` has a `prepare` script so `npm install` always produces `shared/dist`
   before anything else needs it.
4. One `tsconfig.base.json`, strict TypeScript everywhere.
5. Added `.env.example` files; real `.env` files gitignored.

**Decision:** shared Zod schemas are the single source of truth for request/response
shapes, so the UI and API cannot drift.

### Phase 1 - Database first

Order matters: schema -> functions -> RLS -> views -> transactional RPCs -> reporting.

1. `0001_schema.sql` - all tables, enums, constraints.
2. `0002_functions.sql` - `current_user_role`, `assert_role`, `set_updated_at`,
   `handle_new_user` (creates a profile on signup), `write_audit_log`,
   `prevent_delete`, `guard_batch_item_immutability`, `guard_profile_privileges`.
3. `0003_rls.sql` - RLS on every table. Role checks happen in the database, not only
   in Express.
4. `0004_views.sql` - reporting and masking views.
5. `0005_create_sale.sql` - FIFO allocation, idempotency, receipts.
6. `0006_operations.sql` - payments, voids, stock adjustments.
7. `0007_reporting.sql` - dashboards, best sellers, reports.
8. `0008` - customers become name-only (no account linkage needed).
9. `0009` - fix sale balances view.
10. `0010` - sale editing + single-brand batch rules.

**Decision:** anything that touches money or stock is a single transactional RPC.
Never let the client assemble a sale out of multiple inserts.

### Phase 2 - Backend API

1. `src/config/env.ts` - Zod-validated environment. The app refuses to boot with a bad
   config instead of failing later at request time.
2. `src/config/supabase.ts` - three clients:
   - `supabasePublic`: verifies access tokens.
   - `getUserClient(token)`: **all business queries run through this**, so RLS applies.
   - `getAdminClient()`: service role, only for auth admin tasks (invite/deactivate).
3. `requireAuth` verifies the Bearer token, loads the profile, blocks inactive accounts.
4. `requireRole(...roles)` guards owner/manager endpoints.
5. Zod validation middleware on every body/query.
6. Central `fail()` maps Postgres error codes to HTTP statuses (see problem 4.2).
7. Rate limits: 300/min general, 30/15min auth, 120/min writes.
8. `src/app.ts` exports `createApp()`; `api/index.ts` exports it for Vercel, and
   `server.ts` calls `listen()` locally. **No `listen()` in the serverless path.**

### Phase 3 - Frontend

1. Vite + React + Tailwind v4 (via `@tailwindcss/vite`) + alias `@ -> src`.
2. `lib/supabase.ts` - browser client with the **anon key only**.
3. `lib/api.ts` - one fetch wrapper: relative `/api/v1`, attaches the Supabase access
   token, normalises errors, dispatches `vape:unauthorized` on 401.
4. `AuthContext` + route guards from the shared role matrix.
5. Pages: dashboard, inventory, batches, POS, sales, customers, suppliers, reports,
   best sellers, settings, users.
6. TanStack Query for server state; react-hook-form + shared Zod schemas for forms.
7. App-shell layout: fixed sidebar + header, the `<main>` region scrolls, scroll resets
   on route change.
8. CSV export uses an authenticated fetch + Blob download (not a plain link), so the
   Bearer token is sent.

### Phase 4 - Security hardening

- RLS on all tables; `SECURITY DEFINER` functions with explicit role assertions.
- Cost masking: cashiers get quantities from `v_product_stock`, never supplier cost.
- Service role key exists **only** on the server, never in a `VITE_*` variable.
- `helmet`, `x-powered-by` disabled, `trust proxy` set for Vercel.
- 1 MB JSON limit, request logging, centralised error handler that never leaks internals.
- Search terms sanitised before being interpolated into PostgREST `or()` filters.
- CI step greps the frontend bundle/code for service-role references.

### Phase 5 - Testing

- `supabase/tests/smoke.sql`: runs in a transaction and rolls back, so it is safe
  against a live database. Covers FIFO allocation, idempotent retries, oversell and
  overpayment rejection, payment ownership, void restocking, cost masking for cashiers,
  batch-price immutability, and the audit trail.
- `npm run typecheck` across all three workspaces.
- `npm run build` before every deploy.

### Phase 6 - Deployment

1. Root `vercel.json` with two services:

```json
{
  "services": {
    "backend":  { "root": "backend",  "framework": "express", "entrypoint": "api/index.ts" },
    "frontend": { "root": "frontend", "framework": "vite", "outputDirectory": "dist",
                  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": { "service": "backend" } },
    { "source": "/(.*)",     "destination": { "service": "frontend" } }
  ]
}
```

2. Services receive the original path, so Express still sees `/api/v1/...`.
3. Frontend calls relative URLs; `VITE_API_URL` stays unset.
4. Environment variables are project-level and shared by both services.
5. Imported `.env.vercel` through the dashboard's bulk import, then redeployed
   with the build cache disabled.

### Phase 7 - Post-deploy fixes

1. Same-origin CORS handling in `backend/src/app.ts`.
2. Added the SPA fallback rewrite for deep links.
3. Verified `/api/v1/health`, login, and a cross-origin rejection on the live domain.

---

## 4. Problems encountered and how they were fixed

### A. Architecture and deployment

#### 4.1 Two Vercel projects vs one project with services
- **Symptom:** The first plan was separate `frontend` and `backend` projects, requiring
  `VITE_API_URL` and a wide `CORS_ORIGIN` list.
- **Root cause:** Topology was chosen before the deployment model was confirmed.
- **Fix:** One project, two services, `/api/*` rewrite, relative frontend URLs.
- **Lesson:** Decide the deploy topology **before** writing deploy config. Two projects
  means two domains and permanent CORS work; one project removes a whole class of bugs.

#### 4.2 `main` pointed at the wrong file for serverless
- **Symptom:** Vercel would have used `backend/package.json` `main: src/server.ts`,
  which calls `listen()` and exports nothing.
- **Root cause:** The local dev bootstrap and the serverless entrypoint were the same file.
- **Fix:** `api/index.ts` exports the app; `entrypoint: "api/index.ts"` in `vercel.json`.
- **Lesson:** Always separate `createApp()` (exportable) from `listen()` (local only).

#### 4.3 Legacy nested `backend/vercel.json`
- **Symptom:** A leftover v2 config with `builds` + a catch-all rewrite could conflict
  with the root services config.
- **Fix:** Root config is authoritative. The file is kept only for standalone deploys and
  documented as such.
- **Lesson:** One config owner. Delete or explicitly document superseded configs.

#### 4.4 Same-origin POST got 403 on Vercel (the big one)
- **Symptom:** Login and every form submit failed in production, while everything worked
  locally.
- **Root cause:** Browsers attach an `Origin` header to same-origin `POST`/`PATCH`, and the
  CORS allowlist was exact-match against `CORS_ORIGIN` (localhost in dev). Every preview
  deployment also has a unique origin, so previews would fail too.
- **Fix:** Before the CORS middleware, if `Origin` host equals the request `Host`, treat it
  as same-origin (the header is removed). Genuinely cross-origin requests are still checked.
- **Lesson:** CORS is not just a dev cross-origin problem. Test the **deployed** domain and a
  **preview** URL, not just localhost.

#### 4.5 Static SPA 404s on deep links
- **Symptom:** Refreshing `/sales` or `/inventory` would 404.
- **Root cause:** Static hosting looks for a file at that path.
- **Fix:** `"rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]` inside the
  frontend service. Real files are still served first.
- **Lesson:** Every SPA deployment needs a catch-all fallback rewrite.

#### 4.6 Missing `VITE_*` variables produced a broken bundle, not a failed build
- **Symptom:** Deployed app threw `Uncaught Error: supabaseUrl is required`.
- **Root cause:** Vite inlines `import.meta.env.VITE_*` **at build time**. No variables at
  build time = empty strings baked into the JS.
- **Fix:** Bulk-imported `.env.vercel` in Vercel, set them for all environments, redeployed
  with the build cache disabled.
- **Lesson:**
  - Build-time vars must exist **before** the build; adding them later does nothing until
    a new deployment.
  - Put a guard in the build so a missing var fails loudly instead of shipping a broken app.
  - Have one canonical env checklist per environment.

#### 4.7 Vercel CLI was logged out; `gh` was not installed
- **Symptom:** Could not inspect or set env vars from the terminal; could not open issues/PRs.
- **Fix:** Used the dashboard.
- **Lesson:** Verify tooling access at the start of a deployment task, not in the middle.

### B. Database and security

#### 4.8 PostgREST filter injection through `.or()` (SQL-injection class)
- **Symptom:** Search endpoints interpolated the raw search term into PostgREST filter
  syntax: `.or(\`name.ilike.%${term}%\`)`.
- **Root cause:** PostgREST `.or()` is a query language string. Commas, parentheses and `%`
  in user input change the filter structure - a real injection vector even though there is
  no raw SQL.
- **Fix:** `sanitizeSearch()` strips `% _ , ( ) \` before interpolation, applied to every
  search path (products, batches, parties, sales).
- **Lesson:** Treat any string that is parsed as syntax (PostgREST filters, GraphQL, regex,
  shell) as code. Sanitise or use structured APIs. "We use an ORM" is not a security model.

#### 4.9 Supabase returns errors as values, not exceptions
- **Symptom:** Failures became 500s or silent no-ops.
- **Fix:** `fail()` maps Postgres codes: `42501 -> 403`, `28000 -> 401`, `23505 -> 409`,
  `23514/22023/P0001 -> 422`, `22P02 -> 400`, otherwise 500.
- **Lesson:** Write the error-mapping layer once, at the boundary. Never hand-roll per route.

#### 4.10 Supplier cost leaked to cashiers through sale views
- **Symptom:** Sale history and item-count views exposed cost/profit data.
- **Root cause:** Cost columns lived on the same views used by everyone; the UI hid them,
  but the API still returned them.
- **Fix:** Split the data. Quantity-only definer view for everyone; cost views protected by
  RLS and only joined for managers/owners. Sale item counting was routed through the
  masking view.
- **Lesson:** Hide data in the **database**, not the UI. If the API returns it, it is public.

#### 4.11 Mixed-brand batches
- **Symptom:** A batch could contain items from different brands.
- **Fix:** Rule in `create_batch` raising `22023`, surfaced as HTTP 422.
- **Lesson:** Encode business invariants as constraints/triggers, not as frontend checks.

#### 4.12 Editing a completed sale
- **Symptom:** No safe way to correct a sale without corrupting stock history.
- **Fix:** `edit_sale` voids and rebooks inside one transaction, preserving audit rows.
- **Lesson:** "Edit" is usually "reverse + reapply". Never mutate the original ledger.

#### 4.13 Test data cleanup without breaking accounts or functions
- **Symptom:** Needed a clean database but had to keep the owner login and RPCs.
- **Fix:** A cleanup script that truncates business tables in FK order and reseeds settings.
- **Lesson:** Write the cleanup path early. It doubles as a test-fixture reset.

#### 4.14 First owner and disabled sign-up
- **Symptom:** No way to log in on a fresh project.
- **Fix:** Disable public signup; create the first user in Supabase Auth; the
  `handle_new_user` trigger creates the profile; the first profile becomes owner.
- **Lesson:** Document the bootstrap step. A system with no seed path is not deployable.

### C. Frontend and UI

#### 4.15 Sticky sidebar/header became a scrolling mess
- **Symptom:** Pages scrolled the whole document; header and sidebar drifted.
- **Fix:** App-shell layout: viewport-height grid, fixed sidebar/header, `<main>` is the only
  scroll container, scroll resets on route change, POS dialog offset adjusted.
- **Lesson:** Build the shell before the pages. Retrofitting a layout touches every screen.

#### 4.16 Dev port conflict
- **Symptom:** Port 5173 in use; Vite moved to 5174.
- **Fix:** No code change - the proxy still targets the API on 4000.
- **Lesson:** Do not hardcode the dev URL in docs or CORS defaults without checking.

#### 4.17 Bundle size warning (>1 MB)
- **Symptom:** Vite warns about a single large chunk.
- **Status:** **Open.** Recharts and the page set are in one chunk.
- **Lesson:** Plan route-level lazy loading from the start; it is cheap early and annoying later.

### D. Tooling and process

#### 4.18 Windows/PowerShell vs bash
- **Symptom:** Commands with `&&`, `head`, `grep`, `wc` failed.
- **Fix:** `;`, `Select-Object`, `Select-String`, `curl.exe`.
- **Lesson:** Confirm the shell before scripting a workflow; note the quirks in the repo docs.

#### 4.19 `lint` was an alias for `typecheck`
- **Symptom:** No ESLint config exists; `npm run lint` does not lint.
- **Status:** **Open.**
- **Lesson:** Do not name a script `lint` unless it lints. Add a flat config.

#### 4.20 Secrets pasted into chat
- **Symptom:** The `service_role` key was shared in plain text to create an import file.
- **Fix:** Created a gitignored `.env.vercel`, imported it, then recommended rotating the key.
- **Lesson:** Never paste secrets into chat, tickets or logs. If you do, rotate immediately.

#### 4.21 CI does not run the database suite
- **Symptom:** `ci.yml` typechecks, builds and scans for leaked keys, but the SQL smoke tests
  are still run manually.
- **Status:** **Open.**
- **Lesson:** A test suite that is not in CI is a suggestion, not a guarantee.

---

## 5. Verification used before calling it done

```bash
npm run typecheck                 # shared + backend + frontend
npm run build                     # ordered workspace build
npx supabase db query --linked -f supabase/tests/smoke.sql
```

Deployment checks:

```bash
curl https://<app>.vercel.app/api/v1/health        # {"status":"ok"}
# same-origin login must not 403
# a cross-origin request from an unknown origin must still 403
# refresh a deep link such as /sales - must load the SPA, not 404
```

---

## 6. What to avoid next time

1. **Do not choose the deploy topology late.** One project with services beats two projects
   for a single-domain SPA + API. Write `vercel.json` before the UI is finished.
2. **Never call `listen()` in the serverless entrypoint.** Export `createApp()`; keep the
   listener in a local-only file.
3. **Do not let build-time env vars be optional.** Fail the build if
   `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are missing. A red build is cheaper than a
   white screen.
4. **Do not assume `CORS_ORIGIN` covers production.** Browsers send `Origin` on same-origin
   writes; preview URLs are new origins every time. Handle same-origin explicitly.
5. **Do not hide sensitive columns in the UI.** Split views and use RLS. If the API returns
   cost, it is compromised.
6. **Do not interpolate user input into PostgREST `.or()` / filters.** Sanitise `% _ , ( ) \`.
7. **Do not put business logic in the frontend.** Checkout, payments, voids, stock and price
   immutability belong in transactional RPCs/triggers.
8. **Do not mutate financial history.** Edit = reverse + reapply. Keep the audit trail.
9. **Do not build pages before the app shell.** Fixed sidebar/header + one scroll container.
10. **Do not ship a SPA without a fallback rewrite.**
11. **Do not trust a deploy that has not served `/api/v1/health`.** Test the real domain and a
    preview URL, not just localhost.
12. **Do not paste secrets anywhere.** Env files only, gitignored, rotated on exposure, and
    never `VITE_*` for anything privileged.
13. **Do not use `.or()` / dynamic SQL without a sanitizer helper.** One shared helper, used
    everywhere.
14. **Do not name a script `lint` if it only typechecks.** Add ESLint flat config early.
15. **Do not defer the DB test suite.** Put the smoke tests in CI the day they are written.
16. **Do not leave dev-only assumptions in docs.** Ports, origins, localhost URLs and
    workspace install behaviour differ on the platform.
17. **Do not skip `npm install` from a workspace subdirectory when debugging builds.** npm
    walks up to the workspace root; Vercel may run install at the root. Verify, do not assume.
18. **Do not forget lazy loading.** Route-level `lazy()` from day one.
19. **Do not trust relationship/embed names in a query builder.** Verify the column exists on the embedded table; a wrong embed is a 500 at runtime, not a type error.
20. **Do not render "empty" when a request failed.** Always branch on `isError`; an error that looks like "no data" costs hours.
21. **Do not print from inside a modal.** Render a print-only copy outside the dialog; `overflow: hidden` and max-heights silently clip printouts.

---

## 7. Reusable blueprint for the next system

### Phase 0 - Decisions (before code)
- [ ] Deployment topology (single project + services? separate? containers?).
- [ ] Where authorization lives (database, API, or both - prefer both, DB authoritative).
- [ ] Env var contract per environment, including which are build-time.
- [ ] Money, timezone, and rounding rules.
- [ ] Bootstrap path for the first admin account.

### Phase 1 - Foundation
- [ ] Workspace layout + strict TypeScript + shared schema package.
- [ ] `.env.example` for every app; `.gitignore` covers `.env.*`.
- [ ] Root scripts with dependency-ordered build/typecheck.
- [ ] ESLint flat config + Prettier.

### Phase 2 - Database
- [ ] Schema with constraints, enums and FKs.
- [ ] RLS on every table, tested as each role.
- [ ] Triggers for audit, immutability and derived state.
- [ ] Transactional RPCs for every financial/stock operation.
- [ ] Idempotency keys for retryable writes.
- [ ] Masking views for confidential columns.
- [ ] Seed/minimal-data + reset script.
- [ ] Transactional smoke tests.

### Phase 3 - API
- [ ] Fail-fast env validation.
- [ ] `createApp()` exported; `listen()` local only.
- [ ] Token verification + profile/role middleware.
- [ ] Zod validation on every input.
- [ ] Central error mapper (DB code -> HTTP status).
- [ ] Rate limits and security headers.
- [ ] Search sanitisation before any filter DSL.

### Phase 4 - Frontend
- [ ] App shell first (sidebar/header/scroll).
- [ ] Single fetch wrapper with token + error handling.
- [ ] Route guards from the role matrix.
- [ ] Forms share schemas with the API.
- [ ] Route-level code splitting.
- [ ] Build-time guard for required env vars.

### Phase 5 - Verification
- [ ] `typecheck` + `build` green.
- [ ] DB smoke tests green.
- [ ] Manual role matrix walk-through (owner/manager/cashier).
- [ ] Secret scan (no service key in the bundle).

### Phase 6 - Deploy
- [ ] Root config reviewed (services/rewrites/fallback).
- [ ] All env vars set for all environments; build-time ones confirmed.
- [ ] Redeploy after every env change; disable cache when debugging.
- [ ] `/api/v1/health` on the real domain.
- [ ] Login + a write action on production.
- [ ] Deep-link refresh on production.
- [ ] Rotate any exposed key.
- [ ] Tag the release / record the deploy commit.

---

## 8. Known limitations / next steps

- No unit/integration test runner yet; SQL smoke tests are the only automated behavioural suite.
- DB smoke tests are not wired into GitHub Actions yet.
- `npm run lint` is a typecheck alias; no ESLint flat config.
- Frontend ships one large chunk; no route-level code splitting.
- Rate limiting is in-memory per serverless instance, not distributed.
- No rate-limit or CORS test in CI.
- Out of scope for v1: expenses, cash-drawer shifts, returns/refunds, VAT.
- Single store only; no multi-tenant isolation.
- The `service_role` key shared during setup should be rotated.

---

## 9. Change log - 2026-11-03

This is the record of the day the app went live on Vercel and received its first
post-deployment fixes. Everything below is already in `main`.

### 9.1 Commits

| Time | Commit | Change |
|---|---|---|
| 01:29 | `cb90399` | App-shell layout: fixed sidebar/header, `main` is the only scroll container |
| 02:44 | `58797d8` | Single Vercel project with `services`; same-origin CORS fix |
| 02:51 | `4e0f85c` | Deployment docs; restored `backend/vercel.json` for standalone use |
| 03:26 | `bcb1848` | Added this build journal |
| 13:15 | `c3ea7ae` | Fixed stock movement history 500; show batch number |
| 13:35 | `c63795c` | POS hides out-of-stock products |
| 13:43 | `dda5d05` | Complete 80mm thermal receipt |

### 9.2 Deployment go-live

- Deployed as one Vercel project (`vercel.json` services: `backend`, `frontend`).
- First deploy failed at runtime with `Uncaught Error: supabaseUrl is required` because
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` were missing at build time.
- Fix: created a gitignored `.env.vercel` with the backend and frontend variables, bulk
  imported it in Vercel for all environments, then redeployed with the build cache disabled.
- Verified `/api/v1/health`, login, and a cross-origin rejection on the live domain.
- Security follow-up still open: rotate the `service_role` key that was shared in chat.

### 9.3 Fix - stock movement history returned 500 (`c3ea7ae`)

- **Symptom:** `GET /api/v1/products/:id/movements` returned 500; the Inventory history
  dialog showed "No movements yet".
- **Root cause:** the select embedded `batch_items:batch_item_id(batch_number)`, but
  `batch_number` lives on `batches`, not `batch_items`. PostgREST rejected the query and
  `fail()` had no mapping for the error, so it became a generic 500.
- **Fix:**
  - Correct embed: `batch_items:batch_item_id(batch_id, batches(batch_number))`, flattened
    to `batch_number` on each movement.
  - Added `batch_number` to the shared `StockMovement` type.
  - Added `movementsQuerySchema` (`limit` 1-500, default 100) so `?limit=abc` is a 422
    instead of a `NaN` query.
  - Frontend dialog now shows an error message + **Retry** instead of a false empty state.
  - Each history row displays a **Batch …** pill.
- **Verified:** owner JWT against the live database returned 200 with `batch_number:
  "BATCH Testing"`; invalid limit returned 422.
- **Lesson:** query-builder embeds are runtime strings. Check the column on the embedded
  table, and never let a failed request render as "no data".

### 9.4 Feature - POS hides out-of-stock products (`c63795c`)

- **Request:** sold-out items should not appear in the POS grid; they confused the seller.
- **Fix:**
  - Added `inStock` to `inventoryQuerySchema` (optional, default off) and applied
    `.gt("stock_qty", 0)` in `listStock`.
  - POS requests `inStock=true` with `pageSize=100`, plus a defensive client filter.
  - Removed the disabled/faded card UI.
  - Empty states now explain that out-of-stock items are hidden; scanning a sold-out code
    shows a toast instead of doing nothing.
- **Deliberately unchanged:** the Inventory page still shows zero-stock products, and the
  cart still caps quantity against the stock snapshot.
- **Why server-side:** filtering only in the browser would let sold-out rows consume the
  100 saved slots and silently hide sellable products.
- **Verified:** `?inStock=true` returns only positive stock; no filter returns everything;
  `?inStock=maybe` returns 422.

### 9.5 Feature - complete 80mm thermal receipt (`dda5d05`)

- **Request:** the receipt should print full; 80mm thermal paper chosen.
- **Problems with the old version:**
  - The receipt was a 58mm absolutely-positioned element inside the modal.
  - The modal's `overflow-hidden` + `max-h-[92vh]` clipped longer receipts on print.
  - The receipt was missing store details, cashier, payment method and footer.
- **Fix:**
  - New shared component `frontend/src/components/receipt/SaleReceipt.tsx`, used by both
    the on-screen preview and the print copy.
  - A print-only portal (`.print-root` on `document.body`) is rendered on success.
  - `@media print` hides `body > *:not(.print-root)` (removes, not just hides) so nothing
    can clip, then prints black on white at `@page { size: 80mm auto; margin: 3mm }`.
  - Receipt now includes store name/address/phone and footer from Settings, cashier,
    customer, per-item qty x price, subtotal, discount, total, paid, change, balance,
    payment method and reference.
  - Change, method and reference are snapshotted on success before the form resets.
- **Verified:** typecheck and production build pass. Manual print check: complete a sale,
  Print receipt, choose the 80mm printer, 100% scale, margins none/default.
- **Lesson:** never print from inside a modal. Render a dedicated print-only copy in normal
  document flow.

### 9.6 Still open after today

- Rotate the exposed `service_role` key.
- Add the SQL smoke tests to CI.
- Add an ESLint flat config (currently `lint` is a typecheck alias).
- Route-level code splitting (the bundle is still ~1.1 MB).

---

## 10. Change log - 2026-11-04

The day batch management became real: owner-controlled permanent batch deletion,
automatic purge of sold-out batches, and a batch-first POS flow that went through
one design reversal before landing.

### 10.1 Commits

| Time | Commit | Change |
|---|---|---|
| 22:13 | `0b8789b` | POS batch selection + soft-archive batch model |
| 22:14 | `d7eb7c6` | Consistent "Archived" labels on the batches page |
| 22:26 | `ba6c134` | Hard delete batches; auto-purge sold-out batches |
| 23:25 | `75bdd0b` | Batch-first POS: pick a batch, then sell only its items |
| 23:31 | `8fb779c` | POS batches as a filterable horizontal button row |

### 10.2 Feature - POS batch selection (`0b8789b`)

- Added a global **Auto (FIFO) / Choose batch** toggle on the POS, persisted per
  browser in `localStorage` (`pos-batch-mode`) and available to all signed-in staff
  (owner, manager, cashier).
- The first version opened a per-product dialog listing that product's available
  batches and let the cashier pick a quantity. Cart lines became keyed by
  `productId:batchItemId|auto`, so the same product from two batches stayed two lines.
- Checkout sends the pinned `batch_item_id`; pricing comes from the chosen batch.
  `create_sale` already supported pinned batch items, so no transaction rewrite was
  needed.
- Added a cashier-safe `product_available_batches(uuid)` definer RPC and
  `GET /products/:id/batches`; supplier cost was deliberately excluded.
- Added owner-only soft archive (columns, trigger, endpoint, UI) as the first deletion
  model. Superseded later the same day.

### 10.3 Decision reversal - permanent batch deletion (`ba6c134`)

- **Request:** the owner wanted to delete a batch for real, including its items, even
  when it had sales history. Archiving was not enough.
- **Schema:**
  - `sale_item_allocations.batch_item_id` is now nullable with
    `ON DELETE SET NULL`. Sale quantities, prices, costs, payments and profit survive;
    only the pointer to the deleted batch item is lost.
  - The archive columns, trigger, view field, index, endpoint and UI were removed.
- **Manual delete:** owner-only `delete_batch(uuid)` RPC. It writes off any remaining
  stock through `stock_movements` (`reason = 'Batch <number> deleted'`) and then deletes
  the batch; `batch_items` cascade.
  - `DELETE /batches/:id` is owner-only. Managers can view batches but get 403 on delete.
  - No delete control exists on POS, Inventory, Sales, Dashboard or Reports.
- **Automatic purge:** a deferred constraint trigger
  `batch_items_auto_delete` (`DEFERRABLE INITIALLY DEFERRED`) calls
  `auto_delete_empty_batch()` at commit. A batch whose items all reach zero is deleted
  permanently, with no leftover empty rows.
  - It **must** be deferred: `create_sale` decrements `batch_items` before inserting
    `sale_item_allocations`. An immediate trigger would delete the row the allocation is
    about to reference.
- **Batches page:** permanent-delete confirmation states that items are removed, units
  are written off, and history links are detached. The Archived toggle and Restore
  action were removed.
- **Verified in rolled-back transactions:** auto-purge removed the batch and its items
  and detached 23 allocations; manual delete reported `10 items, 50 units written off`
  and logged 10 stock movements.
- **Lesson:** choose the deletion lifecycle before building UI around it. Soft archive
  and hard delete are different products, not a flag. When history must survive a hard
  delete, make the historical FK nullable and `SET NULL` instead of cascading.

### 10.4 Feature - batch-first Choose batch (`75bdd0b`)

- **Request:** instead of picking a batch per product, the owner wanted to pick one of
  the current batches and then see only the items inside it.
- Replaced the per-product dialog with a batch-first flow:
  1. Choose batch mode shows the current batches with stock.
  2. Selecting one filters the product grid to that batch's items, at that batch's
     price and remaining quantity.
  3. Clicking adds directly to the cart, pinned to that batch.
- Two new cashier-safe definer RPCs replaced the per-product one:
  - `pos_active_batches()` - batch number, date received, units left, item count.
  - `pos_batch_items(batch_id)` - product identity, barcode, remaining quantity and
    selling price. No `supplier_price`.
- New endpoints `GET /products/batches` and `GET /products/batches/:batchId/items`;
  both are authenticated and cashier-accessible. The old
  `GET /products/:id/batches` and `product_available_batches()` were removed.
- Barcode/SKU scanning in choose mode searches only the selected batch and asks for a
  batch first when none is selected.
- After checkout the batch queries are invalidated. If the sale emptied the batch, the
  auto-purge removes it and the selected-batch effect resets the picker.
- Migration `20261105000014` filters archived products out of `pos_active_batches()` so
  the batch counts match the item list exactly.

### 10.5 UI - filterable batch button row (`8fb779c`)

- **Request:** the batch dropdown does not scale when there are many batches.
- Replaced the `<select>` with a single horizontally scrolling row of batch buttons:
  batch number, units left, item count and date received. The selected button gets the
  accent border and a check icon.
- Added a **Filter batches…** input (matches batch number and received date, including
  the formatted date) and a batch-count badge.
- The row never wraps, so a long batch list cannot push the product grid down. Filtering
  only hides buttons; it does not clear the current selection.
- Empty filter results show "No batches match …" in the row area.
- **Scope:** `frontend/src/pages/pos/PosPage.tsx` only. No backend or schema changes.

### 10.6 Migrations applied

| Migration | Purpose |
|---|---|
| `20261104000011_pos_batch_selection.sql` | POS batch options + initial soft-archive model (later superseded) |
| `20261105000012_hard_delete_batches.sql` | Nullable allocation FK, deferred auto-purge, `delete_batch()`, archive removal |
| `20261105000013_pos_batch_first.sql` | `pos_active_batches()`, `pos_batch_items()`; dropped `product_available_batches()` |
| `20261105000014_pos_active_batches_archived_products.sql` | Excludes archived products from the batch selector counts |

### 10.7 Verified

- `npm run typecheck` and `npm run build` pass after every step.
- Live API checked with an owner JWT: batch list has no archive field, POS batch
  endpoints return safe fields only, and the old archive route is gone.
- Rolled-back DB tests covered manual delete, auto-purge, allocation detachment and
  stock write-off movements.
- Both migrations pushed to the linked Supabase project; no test data persisted.

### 10.8 Still open after today

- Rotate the exposed `service_role` key.
- Add the SQL smoke tests to CI.
- Add an ESLint flat config.
- Route-level code splitting (bundle still ~1.1 MB).
- Live smoke test of the deployed batch-first POS after the Vercel redeploy.

---

## 11. Change log - 2026-11-06

Branding: the shop's own artwork became the site logo. Frontend-only work - no
backend, schema or shared-code changes.

### 11.1 Commit

| Time | Commit | Change |
|---|---|---|
| 00:42 | `a15bed2` | Vape Shop logo as favicon, social preview image and sidebar logo |

### 11.2 Feature - site logo (`a15bed2`)

- **Request:** use the shop's `website.png` artwork (the "Vape Shop" sticker with
  vape devices and smoke) as the website image.
- **Problem found first:** the app had **no favicon at all**. `frontend/public/` was
  empty and `index.html` had no `<link rel="icon">`, so every browser tab showed the
  default globe icon.
- **Asset:** copied `website.png` (600x600 PNG) to `frontend/public/logo.png` and
  committed that copy. The originals in the repo root (`website.png`,
  `website image.jpg`) stay untracked and out of the repo.
  - Vite serves `public/` at the site root and copies it into `dist/` on build, so
    `/logo.png` resolves the same locally and in production.
- **`frontend/index.html`:**
  - `<link rel="icon" type="image/png" href="/logo.png">` - browser tab and bookmarks.
  - `<link rel="apple-touch-icon" href="/logo.png">` - iOS home screen.
  - Open Graph + Twitter card tags (`og:type`, `og:title`, `og:description`,
    `og:image`, `twitter:card`, `twitter:image`) so shared links preview the logo.
    The image URL is **absolute** (`https://vape-sales-management-system.vercel.app/logo.png`)
    because several scrapers ignore relative `og:image`.
  - Fixed a corrupted character in `<title>`: it contained a U+FFFD replacement
    character (`Vape Store A Sales & Inventory`) and now reads
    `Vape Store · Sales & Inventory`.
  - `theme-color` untouched.
- **`frontend/src/components/layout/Sidebar.tsx`:** replaced the generic `Boxes`
  glyph in the sidebar header with `<img src="/logo.png">` at 32x32, rounded with a
  `ring-1` border so the white artwork reads against the dark theme. The `Boxes`
  import is still used by the Batches nav item.
- **Verified:** `npm run typecheck` and `npm run build` pass; `dist/logo.png` is in the
  build output and the built `index.html` contains the icon, apple-touch and social
  tags.
- **Lesson:** ship the favicon in the first deploy - a missing one is invisible in
  screenshots and easy to forget. Put brand assets in `public/` and reference them
  with a root-absolute path so they survive the build. Favicons are cached hard by
  browsers, so expect to hard-refresh after a deploy.

### 11.3 Still open after today

- Rotate the exposed `service_role` key.
- Add the SQL smoke tests to CI.
- Add an ESLint flat config.
- Route-level code splitting (bundle still ~1.1 MB).
- Live smoke test of the deployed batch-first POS after the Vercel redeploy.
- Optional branding follow-ups: logo on the login screen, a dedicated 512px square
  crop for the OG image.

