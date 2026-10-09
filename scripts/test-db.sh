#!/usr/bin/env bash
# Spielt Supabase-Attrappe, alle Migrationen und die Schema-Tests in eine frische Datenbank ein.
#
# Aufruf: DATABASE_URL=postgres://postgres@localhost:5432/postgres scripts/test-db.sh
# Die Datenbank-URL muss auf einen Server zeigen, auf dem eine Wegwerf-Datenbank angelegt
# werden darf (z. B. lokales PostgreSQL >= 15 oder ein Docker-Container). Mit Supabase
# selbst nicht verwenden: Die Attrappe legt Rollen an, die es dort schon gibt.
set -euo pipefail
shopt -s nullglob

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
run_test() {
  PGOPTIONS='--client-min-messages=notice' psql "$TEST_URL" -qX -v ON_ERROR_STOP=1 -f "$1" 2>&1 \
    | sed -E 's/^psql:[^:]+:[0-9]+: NOTICE:  //'
}

run_test "$ROOT/supabase/tests/schema.test.sql"
run_test "$ROOT/supabase/tests/security.test.sql"

# Import eines Bot-Runs (Testdaten im Bot-Format): SQL erzeugen, einspielen, Zähler und Einladungslinks prüfen
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"; cleanup' EXIT
python3 "$ROOT/tools/migration/migrate_bot_data.py" \
  --run-dir "$ROOT/tools/migration/tests/run" --slug bot-import --owner moritz \
  --out "$WORK/migration.sql" --report "$WORK/report.json" --links-out "$WORK/links.json" >/dev/null
run_sql "$WORK/migration.sql"
token() { python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))[sys.argv[2]].split("#", 1)[1])' "$WORK/links.json" "$1"; }
PGOPTIONS='--client-min-messages=notice' psql "$TEST_URL" -qX -v ON_ERROR_STOP=1 \
  -v owner_token="$(token Moritz)" -v player_token="$(token Janne)" \
  -f "$ROOT/tools/migration/tests/check.sql" 2>&1 | sed -E 's/^psql:[^:]+:[0-9]+: NOTICE:  //'

# Demo-Challenge: muss in einer Transaktion durchlaufen (wie im SQL Editor) und mit 3 Wipes und 1 Sieg enden
psql "$TEST_URL" -qX -1 -v ON_ERROR_STOP=1 -f "$ROOT/supabase/demo/demo_challenge.sql" >/dev/null
# SoulSilver-Demo mit Windows-Zeilenenden (wie aus dem SQL Editor unter Windows): alle vier in einem Soul-Link
sed 's/$/\r/' "$ROOT/supabase/demo/demo_soulsilver.sql" > "$WORK/demo_soulsilver_crlf.sql"
psql "$TEST_URL" -qX -1 -v ON_ERROR_STOP=1 -f "$WORK/demo_soulsilver_crlf.sql" >/dev/null
psql "$TEST_URL" -qX -v ON_ERROR_STOP=1 -c "
do \$\$
declare
  v public.challenge_stats;
begin
  select s.* into v from public.challenge_stats s join public.challenges c on c.id = s.challenge_id
  where c.slug = 'demo-platin-soullink';
  if v.wipes_total <> 3 or v.wins_total <> 1 then
    raise exception 'Demo-Challenge: % Wipes, % Siege', v.wipes_total, v.wins_total;
  end if;
  raise notice 'ok - Demo-Challenge: 3 Wipes, 1 Sieg';
  select s.* into v from public.challenge_stats s join public.challenges c on c.id = s.challenge_id
  where c.slug = 'demo-soulsilver-alle';
  if v.wipes_total <> 1 or v.current_run <> 2 or exists (
    select 1 from public.encounters e join public.challenges c on c.id = e.challenge_id
    where c.slug = 'demo-soulsilver-alle' and e.kind = 'wild' group by e.link_id having count(*) <> 4
  ) then
    raise exception 'SoulSilver-Demo: unerwarteter Stand';
  end if;
  raise notice 'ok - SoulSilver-Demo: alle vier pro Soul-Link, Run 2 läuft';
end;
\$\$;" 2>&1 | sed -E 's/^NOTICE:  //'
