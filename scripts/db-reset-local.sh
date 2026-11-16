#!/usr/bin/env bash
# Recreates the LOCAL test database (never point this at Supabase).
set -euo pipefail
PGURL_ADMIN="${PGURL_ADMIN:-postgres://postgres@127.0.0.1:54322/postgres}"
DB="${1:-zeronotice_test}"
psql "$PGURL_ADMIN" -q -c "drop database if exists $DB with (force)" -c "create database $DB"
URL="${PGURL_ADMIN%/*}/$DB"
psql "$URL" -q -v ON_ERROR_STOP=1 -c "alter database $DB set search_path = public, extensions" -f tests/support/supabase-shim.sql
for f in supabase/migrations/*.sql; do psql "$URL" -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null; echo "applied $f"; done
