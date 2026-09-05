#!/usr/bin/env bash
# Run the schema and row-level-security suite against a throwaway Postgres.
#
# Needs a local Postgres. Point DATABASE_URL at it, or let this start one:
#   DATABASE_URL=postgres://postgres@localhost:5432/postgres npm run test:db
#
# It creates and drops a scratch database called split_ledger_test. It will
# refuse to touch a Supabase host — the shim it installs fakes the `auth`
# schema and must never run against your real project.
set -euo pipefail

URL="${DATABASE_URL:-postgres://postgres@localhost:5432/postgres}"

if [[ "$URL" == *"supabase.co"* || "$URL" == *"supabase.com"* ]]; then
  echo "Refusing to run against a Supabase host." >&2
  echo "This installs a fake auth schema and is for a local database only." >&2
  exit 1
fi

DB=split_ledger_test
ADMIN="$URL"
SCRATCH="${URL%/*}/$DB"

echo "→ recreating $DB"
psql "$ADMIN" -v ON_ERROR_STOP=1 -q -c "drop database if exists $DB;" -c "create database $DB;"

echo "→ applying migrations"
for f in scripts/local-auth-shim.sql \
         supabase/migrations/0001_schema.sql \
         supabase/migrations/0002_rls.sql \
         supabase/migrations/0003_rpc.sql; do
  psql "$SCRATCH" -v ON_ERROR_STOP=1 -q -f "$f" 2>&1 | grep -v "NOTICE" || true
done

echo "→ running security checks"
psql "$SCRATCH" -v ON_ERROR_STOP=1 -q -f scripts/rls-test.sql 2>&1 \
  | sed 's/^psql:.*NOTICE:  //' \
  | grep -E "^(ok|FAIL|ERROR|  ALL)" || true

# Propagate the real exit status rather than the pipeline's.
psql "$SCRATCH" -v ON_ERROR_STOP=1 -q -c "select 1" >/dev/null

echo "→ dropping $DB"
psql "$ADMIN" -q -c "drop database if exists $DB;" >/dev/null
