<!-- PR Draft: Add penalty_percent to transactions and update apply_transaction -->

# Add `penalty_percent` column & `apply_transaction` support

Summary
- Adds durable screenshot-penalty support that is recorded on transactions.
- Introduces `transactions.penalty_percent` (numeric) and extends `apply_transaction` to accept `p_penalty_percent`.
- Updates server route and client/UI to pass the penalty percent; includes backward-compatible retry for rollout.

Files changed (key)
- docs/supabase/schema.sql — updated function and schema notes
- migrations/20260806_add_penalty_percent.sql — migration SQL
- src/lib/supabase/types.ts — added `penalty_percent` to types
- src/app/api/penalty/route.ts — pass `p_penalty_percent`, fallback for old signature
- src/components/reading/reader.tsx — UI + local fallback updates
- src/components/audio/chapter-queue.tsx — typing fix
- scripts/test_apply_transaction.mjs, scripts/test_penalty_route.mjs — test updates

Migration
1. Run the SQL in `migrations/20260806_add_penalty_percent.sql` in Supabase SQL editor (or via psql).
2. Redeploy the app server so server code can call the new RPC signature. (The server uses a fallback if the DB hasn't been migrated yet.)

Rollout notes
- The code contains a backward-compatible retry: if the DB function lacks the new signature, the code retries the old call. This avoids downtime during migration.
- Update all purchase/charge flows to compute `final_amount = Math.ceil(base_amount * (1 + penalty_percent))` and call `apply_transaction` with `p_penalty_percent`.

How to create the PR locally
```bash
# from repo root
git checkout -b feature/add-penalty-percent
git add docs/supabase/schema.sql migrations/20260806_add_penalty_percent.sql src/lib/supabase/types.ts src/app/api/penalty/route.ts src/components/reading/reader.tsx src/components/audio/chapter-queue.tsx scripts/test_apply_transaction.mjs scripts/test_penalty_route.mjs
git commit -m "Add penalty_percent column, update apply_transaction RPC, pass penalty_percent in routes/tests, update types and UI, add migration"
git push -u origin feature/add-penalty-percent

# create draft PR (requires GitHub CLI `gh` configured)
gh pr create --title "Add penalty_percent column & apply_transaction support" --body-file .github/PR_DRAFT_ADD_PENALTY_PERCENT.md --draft
```

Testing performed
- Ran `node ./scripts/test_apply_transaction.mjs` and `node ./scripts/test_penalty_route.mjs` against dev Supabase.
- Verified `transactions.penalty_percent` persisted after running migration.
- Full `npm run build` succeeded locally.

Suggested reviewers: @backend, @db-admin, @frontend
