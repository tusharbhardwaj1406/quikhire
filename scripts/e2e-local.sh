#!/usr/bin/env bash
# Runs the browser tests against a production build, a fresh local database and the auth test stub.
set -euo pipefail
export DATABASE_URL="postgres://postgres@127.0.0.1:54322/quikhire_e2e"
export NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321" NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="test-anon-key" SUPABASE_SECRET_KEY="test-secret"
export NEXT_PUBLIC_SITE_URL="http://localhost:3000" STORAGE_DRIVER=local CRON_SECRET="e2e-cron-secret" NEXT_TELEMETRY_DISABLED=1
./scripts/db-reset-local.sh quikhire_e2e >/dev/null
rm -rf .local-storage
pnpm build >/dev/null
pkill -f tests/support/auth-stub.mjs 2>/dev/null || true; pkill -f 'next/dist/bin/next start' 2>/dev/null || true
node tests/support/auth-stub.mjs & STUB=$!
node node_modules/next/dist/bin/next start -p 3000 >/tmp/zn-next.log 2>&1 & APP=$!
trap 'kill $STUB $APP 2>/dev/null || true' EXIT
for i in $(seq 1 40); do curl -sf http://localhost:3000/robots.txt >/dev/null && break; sleep 1; done
pnpm exec playwright test "$@"
