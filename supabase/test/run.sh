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

for f in "$HERE/../schema.sql" "$HERE/../sync.sql" "$HERE/../coparents.sql" "$HERE/../allowance.sql" "$HERE/../guilds.sql" "$HERE/../notifications.sql" "$HERE/../consent.sql" "$HERE/../billing.sql" "$HERE/../charity.sql" "$HERE/../alliances.sql" "$HERE/../schools.sql" "$HERE/../leaderboards.sql" "$HERE/../reminders.sql" "$HERE/../digests.sql" "$HERE/../referrals.sql" "$HERE/../retention.sql" "$HERE/../crashes.sql" "$HERE/../health.sql" "$HERE/00b-helpers.sql"; do
  if ! psql -q -v ON_ERROR_STOP=1 -f "$f" "$DB" >"$OUT" 2>&1; then
    echo "$(basename "$f") FAILED TO APPLY:"; cat "$OUT"; exit 1
  fi
done
echo "schema applied cleanly"
# What every function, trigger, policy and table looks like now, to compare
# with after the second application (18-upgrade.sql).
psql -q -v ON_ERROR_STOP=1 -v pass=first -f "$HERE/upgrade-snapshot.sql" "$DB" >"$OUT" 2>&1 \
  || { echo "could not record the schema after the first application:"; cat "$OUT"; exit 1; }

# Apply every file a SECOND time, over the database that now has data in it.
#
# This project has no migration tool: the upgrade procedure is "re-run these
# files", so they have to be safe to run twice. A `create table` without IF NOT
# EXISTS aborts its file and leaves everything after it unapplied — which is a
# half-upgraded database with nothing on screen to say so. 18-upgrade.sql then
# checks what survived.
for f in "$HERE/../schema.sql" "$HERE/../sync.sql" "$HERE/../coparents.sql" "$HERE/../allowance.sql" "$HERE/../guilds.sql" "$HERE/../notifications.sql" "$HERE/../consent.sql" "$HERE/../billing.sql" "$HERE/../charity.sql" "$HERE/../alliances.sql" "$HERE/../schools.sql" "$HERE/../leaderboards.sql" "$HERE/../reminders.sql" "$HERE/../digests.sql" "$HERE/../referrals.sql" "$HERE/../retention.sql" "$HERE/../crashes.sql" "$HERE/../health.sql"; do
  if ! psql -q -v ON_ERROR_STOP=1 -f "$f" "$DB" >"$OUT" 2>&1; then
    echo "$(basename "$f") IS NOT SAFE TO RE-RUN:"; cat "$OUT"; exit 1
  fi
done
echo "schema re-applies cleanly over itself"
psql -q -v ON_ERROR_STOP=1 -v pass=second -f "$HERE/upgrade-snapshot.sql" "$DB" >"$OUT" 2>&1 \
  || { echo "could not record the schema after the second application:"; cat "$OUT"; exit 1; }

status=0
failed=""
# Every numbered file, not a hand-maintained range. The previous pattern only
# matched 01-19, so 20-referrals.sql was written, committed, and silently never
# run — the worst way for a test to fail.
for f in "$HERE"/[0-9][0-9]-*.sql; do
  # 00-shim.sql is the Supabase stand-in, not a test, and it has already run.
  case "$(basename "$f")" in 00-*) continue;; esac
  echo ""
  echo "=== $(basename "$f") ==="
  PGOPTIONS='-c client_min_messages=notice' psql -q -v ON_ERROR_STOP=1 -f "$f" "$DB" >"$OUT" 2>&1
  code=$?
  sed 's/^NOTICE:  //' "$OUT" | grep -E '(PASS|FAIL|ERROR|DETAIL)' || true
  if [ $code -ne 0 ]; then
    status=1
    failed="$failed $(basename "$f")"
    echo "--- failure detail ---"; tail -20 "$OUT"
  fi
done

rm -f "$OUT"
echo ""
# One line that says which files, so nobody has to scroll for it.
if [ $status -eq 0 ]; then echo "ALL SQL CHECKS PASSED"; else echo "SQL CHECKS FAILED:$failed"; fi
exit $status
