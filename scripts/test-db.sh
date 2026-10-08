#!/usr/bin/env bash
# Spielt Supabase-Attrappe, alle Migrationen und die Schema-Tests in eine frische Datenbank ein.
#
# Aufruf: DATABASE_URL=postgres://postgres@localhost:5432/postgres scripts/test-db.sh
# Die Datenbank-URL muss auf einen Server zeigen, auf dem eine Wegwerf-Datenbank angelegt
# werden darf (z. B. lokales PostgreSQL >= 15 oder ein Docker-Container). Mit Supabase
# selbst nicht verwenden: Die Attrappe legt Rollen an, die es dort schon gibt.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL setzen, z. B. postgres://postgres@localhost:5432/postgres}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="soullink_test_$$"

psql "$DATABASE_URL" -qX -v ON_ERROR_STOP=1 -c "create database $DB" >/dev/null
TEST_URL="$(printf '%s' "$DATABASE_URL" | sed -E "s#/[^/?]*(\?|$)#/$DB\1#")"

cleanup() {
  psql "$DATABASE_URL" -qX -c "drop database if exists $DB" >/dev/null || true
}
trap cleanup EXIT

run_sql() {
  PGOPTIONS='--client-min-messages=warning' psql "$TEST_URL" -qX -v ON_ERROR_STOP=1 -f "$1"
}

run_sql "$ROOT/supabase/tests/supabase_stub.sql"
for migration in "$ROOT"/supabase/migrations/*.sql; do
  run_sql "$migration"
done
PGOPTIONS='--client-min-messages=notice' psql "$TEST_URL" -qX -v ON_ERROR_STOP=1 \
  -f "$ROOT/supabase/tests/schema.test.sql" 2>&1 | sed -E 's/^psql:[^:]+:[0-9]+: NOTICE:  //'
