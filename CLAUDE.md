# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

"Vịnh" — a Vietnamese web novel / audio-drama / illustration platform (Next.js 16, App Router).
Readers browse and buy chapters with a token wallet; authors upload manuscripts, audio
narrations, and design/art; admins moderate content, disputes, and payouts. Domain-specific
routes are Vietnamese (`/truyen`, `/ban-thao`, `/ca-nhan`, `/nhiem-vu`, `/thanh-tuu`, `/ket-noi`,
`/dang-nhap`, `/dang-ky`), so match that convention for anything user-facing.

A companion FastAPI service (`python-service/`) is a separate deployable — a skeleton quest-
generation worker that polls a Supabase job queue and calls the Claude API. It has nothing to do
with the Next.js build; treat it as its own project (own `requirements.txt`, own `Dockerfile`, own
README) unless a task explicitly touches quest generation infra.

## Commands

```bash
npm run dev              # start dev server
npm run build             # production build
npm run start             # run a production build
npm run lint               # eslint (flat config, eslint-config-next)
npx tsc --noEmit           # typecheck (no test runner in this repo — this + lint + a manual
                            # build/route/UI check is the closest thing to CI; see docs/DEV_WORKFLOW.md)
npm run convert-legal-docs  # regenerate src/lib/legal/*.ts from the .docx sources in docs/ (mammoth)
```

Python service (independent, not part of the Next.js app):
```bash
cd python-service
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required
uvicorn app.main:app --reload
```

There is no automated test suite — verification is `npx tsc --noEmit`, `npm run lint`, a real
`npm run build`, and exercising the actual route/UI (see docs/DEV_WORKFLOW.md).

## Architecture

### Auth: two session systems running in parallel, on purpose

- `src/lib/auth.ts` — client-side fetch wrappers (`login`, `register`, OTP verify/resend, etc.)
  calling the `/api/auth/*` routes. `Role` is `"user" | "admin" | "super_admin"`.
- `src/lib/session.ts` — a hand-rolled **httpOnly, HMAC-signed cookie** (`vinh_session`, Web Crypto,
  no JWT library) set by the auth routes after Supabase auth succeeds. This is what `src/proxy.ts`
  and `requireAdmin()` read — plain Supabase SSR cookies (`sb-*`) aren't readable cheaply enough for
  every request in proxy.
- Supabase itself (`@supabase/ssr`) is the real identity/password backend and owns `sb-*` cookies.

Both cookies exist simultaneously; that's intentional (see docs/SUPABASE_SETUP.md §4), not a bug to
"fix" by deleting one. `getAuthedUserId()`/`getAuthedAdminId()` (`src/lib/wallet/session.ts`) resolve
a caller's `auth.users` id by trying the signed cookie first (looks up `profiles` by `username`),
then falling back to a real Supabase session — most server routes that need "who is calling"
should reuse these rather than re-deriving it.

Route protection is defense-in-depth, two layers:
1. **`src/proxy.ts`** (Next 16 renamed `middleware.ts` → `proxy.ts`, same API — see the Next docs
   bundled in `node_modules/next/dist/docs/`) — fast, cookie-only, no DB hit. Guards
   `/admin/**` (admin/super_admin), `/author/**`, `/ca-nhan/**`, `/nhiem-vu/**`, `/thanh-tuu/**`
   (any logged-in user).
2. **`requireAdmin()`** (`src/lib/session.ts`) called from `src/app/admin/layout.tsx` — the real
   authorization boundary per Next's own guidance (proxy is "optimistic" only).

`super_admin` has every `admin` permission plus the sole ability to reassign roles — always check
`role !== "admin" && role !== "super_admin"`, never just `!== "admin"`, or super_admins get locked
out (this exact bug has been fixed twice — see git log for `proxy.ts` / `session.ts`).

Password reset / signup confirmation is **OTP-code only, not email links** — PKCE links break when
a mobile mail app opens the link in a different browser than the one that started the flow. See
docs/SUPABASE_SETUP.md §5 for the full state machine before touching `/quen-mat-khau`,
`/dat-lai-mat-khau`, or `/api/auth/verify-otp`.

### Data layer: Supabase, service-role-first

- `src/lib/supabase/{client,server,types}.ts` — SSR-aware clients; `types.ts` is the generated DB
  type surface, kept in sync with `docs/supabase/schema.sql` by hand (see docs/DEV_WORKFLOW.md).
- Most API routes use the **service-role client** (bypasses RLS/GRANT) rather than the user's own
  session, so RLS policies in `docs/supabase/schema.sql` are largely defense-in-depth, not the
  primary access check — authorization logic lives in the route handler / `lib` service module.
- Schema changes are hand-written SQL files in `migrations/` (`YYYYMMDD_description.sql`,
  idempotent — `IF EXISTS`/`IF NOT EXISTS`), applied to dev/staging first and RLS-tested there
  (see docs/DEV_WORKFLOW.md for the exact test-in-a-transaction recipe) before production. Every
  migration must be mirrored into `docs/supabase/schema.sql` (in dependency order) and
  `src/lib/supabase/types.ts` in the same change.
- Sensitive data is deliberately split off the hot `profiles` table: `identity_verifications`
  (CCCD number + private-bucket image paths) is a separate table so the frequently-queried
  `profiles` row never carries it. CCCD images live in a **private** Supabase Storage bucket,
  accessed only via short-lived signed URLs — never made public, per Nghị định 13/2023/NĐ-CP.

### Domain modules (`src/lib/<domain>/` + `src/app/api/<domain>/`)

Each business area is a self-contained pair of a `lib` service module (business logic, Supabase
calls) and matching API routes; components consume the API, not Supabase directly. Notable ones:

- `wallet/` — token balance, deposits (ZaloPay gateway, `wallet/gateways/zalopay.ts`; sandbox vs
  production picked by `ZALOPAY_ENV`), withdrawals (`withdrawal-service.ts` — payout gateway is
  **unimplemented**, adapter stubbed), ledger, and a settle-pending cron (`vercel.json`).
- `orders/` — commission/service-order lifecycle: drafts, scope changes, disputes, cancellation,
  lost-contact reporting, watermarking delivered assets (`watermark.ts`/`xmp.ts`), an auto-confirm
  cron.
- `authoring/` — manuscript upload/splitting into chapters, exclusivity agreements/locks, cover
  generation, audio linking.
- `quests/` — daily task pool, streaks, achievement/reward engine; quest *generation* (AI-authored
  tasks) is the separate `python-service/` skeleton, not implemented in Next.js yet.
- `legal/` — one `.ts` module per contract/policy, **generated** from `.docx` sources in `docs/` by
  `scripts/convert-legal-docs.mjs` (via `mammoth`). Never hand-edit the generated files — edit the
  `.docx`, rename it with the new "UTD ddMMyyyy" date suffix, update the `source` path in the
  script, then rerun `npm run convert-legal-docs`. `registry.ts` tracks each agreement's id/date so
  the app can detect a user's prior acceptance is stale.
- `covers/`, `audio/`, `design/`, `rankings/`, `search/`, `admin/` — read-side aggregation/query
  helpers backing their respective pages; some rankings tabs (Audio/Blog) are still mock data
  (`rankings-data.ts`) pending a real table — check the module before assuming a tab is live.

### UI conventions

- **Always consider the mobile/phone UI**, not just desktop — check responsive behavior (layout,
  spacing, tap targets) for any UI change, even if not explicitly asked.
- `src/app/globals.css` defines all color tokens as Tailwind v4 `@theme` variables
  (`--color-brand-ink`, etc.) — never hardcode a hex color; add/reuse a token instead. A few
  near-duplicate tokens (`stone`/`stone-alt`, the `cream-*` family) are kept intentionally separate
  pending designer sign-off — don't unify them unprompted.
- `src/components/ui/` is the shared component kit (`Field`, `Button`, `Alert`, `Checkbox`,
  `GenreSelect`, `BankSelect`, `Pill`, etc., exported from `ui/index.ts`). Prefer these over ad-hoc
  `<input>`/`<label>` markup in new or edited forms — see docs/MIGRATION_GUIDE.md for the pattern
  and the list of components not yet migrated.

### Other things worth knowing before editing nearby code

- `src/lib/ocr.ts` (Tesseract.js) OCRs CCCD (Vietnamese ID card) photos during registration to
  cross-check the typed CCCD number; always wrap `recognize()` calls in a timeout — tesseract.js
  has none of its own and a stalled worker/CDN fetch hangs the request indefinitely.
- Image uploads (CCCD, covers, avatars) are compressed client-side before upload
  (`src/lib/media/compress-image.ts`) — keep that in the flow rather than uploading raw files.
- `docs/DEV_WORKFLOW.md` is the authoritative process for any schema-touching change; read it
  before writing a migration. It also states the working norms: check `git status` before
  `git add` (staged files may be stale if edited again after staging), and never commit/push
  without being asked.
