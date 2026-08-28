#!/usr/bin/env bash
# Applies the schema to a scratch database and runs every test file against it.
# Needs a local Postgres — see supabase/test/README.md.
set -uo pipefail
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-55432}" PGUSER="${PGUSER:-postgres}"
DB="${DB:-rankup_test}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$(mktemp)"

psql -q -tAc "drop database if exists $DB;" postgres >/dev/null 2>&1
psql -q -tAc "create database $DB;" postgres >/dev/null 2>&1
psql -q -v ON_ERROR_STOP=1 -f "$HERE/00-shim.sql" "$DB" >/dev/null 2>&1 || { echo "shim failed"; exit 1; }

for f in "$HERE/../schema.sql" "$HERE/../sync.sql" "$HERE/../guilds.sql"; do
  if ! psql -q -v ON_ERROR_STOP=1 -f "$f" "$DB" >"$OUT" 2>&1; then
    echo "$(basename "$f") FAILED TO APPLY:"; cat "$OUT"; exit 1
  fi
done
echo "schema applied cleanly"

status=0
for f in "$HERE"/0[1-9]-*.sql; do
  echo ""
  echo "=== $(basename "$f") ==="
  PGOPTIONS='-c client_min_messages=notice' psql -q -v ON_ERROR_STOP=1 -f "$f" "$DB" >"$OUT" 2>&1
  code=$?
  sed 's/^NOTICE:  //' "$OUT" | grep -E '(PASS|FAIL|ERROR|DETAIL)' || true
  if [ $code -ne 0 ]; then
    status=1
    echo "--- failure detail ---"; tail -20 "$OUT"
  fi
done

rm -f "$OUT"
echo ""
if [ $status -eq 0 ]; then echo "ALL SQL CHECKS PASSED"; else echo "SQL CHECKS FAILED"; fi
exit $status
