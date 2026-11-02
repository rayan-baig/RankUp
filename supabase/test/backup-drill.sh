#!/usr/bin/env bash
# A backup nobody has restored is a guess. This takes one the way
# docs/BACKUPS.md says to, restores it into an empty database, and compares
# what came back with what went in, table by table.
#
#   supabase/test/backup-drill.sh            # against the local test database
#   DB=rankup_fix supabase/test/backup-drill.sh
#
# Needs the local Postgres from supabase/test/up.sh.
set -euo pipefail
export PGHOST=${PGHOST:-/tmp} PGPORT=${PGPORT:-55432} PGUSER=${PGUSER:-postgres}
DB=${DB:-rankup_test}
BIN=$(dirname "$(command -v pg_dump || echo /usr/lib/postgresql/16/bin/pg_dump)")
[ -x "$BIN/pg_dump" ] || BIN=/usr/lib/postgresql/16/bin
DUMP=$(mktemp --suffix=.dump)
DRILL=rankup_backup_drill

# Both schemas. The children's rows point at sign-in accounts in `auth`; a
# backup of `public` alone restores the families with nobody able to sign in,
# and the restore refuses the link between them.
"$BIN/pg_dump" --format=custom --no-owner --no-privileges --schema=public --schema=auth --file="$DUMP" "$DB"
"$BIN/dropdb" --if-exists "$DRILL" >/dev/null
"$BIN/createdb" "$DRILL"
# A new Supabase project comes with its extensions; a dump of two schemas does
# not carry them. schema.sql asks for pgcrypto, so the empty database has it,
# as the real one would.
psql -qd "$DRILL" -c 'create extension if not exists "pgcrypto"' >/dev/null
# "schema public already exists" is the one expected complaint.
"$BIN/pg_restore" --no-owner --no-privileges --dbname="$DRILL" "$DUMP" 2>/dev/null || true

# Then the SQL files, in the order docs/LAUNCH.md lists them, as
# docs/BACKUPS.md says to after a restore. A copy taken with --no-privileges
# leaves out who may run what, so a restored database lets anybody call every
# function — the ones that read or delete across every family included —
# until the files put the revokes back. Read from LAUNCH.md itself, so the
# drill follows the instructions a person would.
HERE="$(cd "$(dirname "$0")" && pwd)"
files=$(grep -oE '^- \[ \] `supabase/[a-z]+\.sql`' "$HERE/../../docs/LAUNCH.md" | grep -oE 'supabase/[a-z]+\.sql')
[ -n "$files" ] || { echo "no SQL files listed in docs/LAUNCH.md"; exit 1; }
for f in $files; do
  psql -q -v ON_ERROR_STOP=1 -d "$DRILL" -f "$HERE/../../$f" >/dev/null 2>&1 \
    || { echo "  FAIL $f does not apply over the restored copy"; status_files=1; }
done

status=${status_files:-0}
# Every table there is today, read from the database rather than written out
# here: a list in this file was a list of the tables there were when it was
# written, and a table added since would never have been checked.
tables=$(psql -tAd "$DB" -c "select format('%I.%I', n.nspname, c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                             where c.relkind in ('r', 'p') and (n.nspname = 'public' or (n.nspname = 'auth' and c.relname = 'users'))
                             order by n.nspname <> 'auth', c.relname")
[ -n "$tables" ] || { echo "no tables found in $DB"; exit 1; }
count=0
for t in $tables; do
  count=$((count + 1))
  # Not just how many rows: what is in them. md5 over every row, in order.
  live=$(psql -tAd "$DB" -c "select count(*) || ' ' || md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from $t x")
  back=$(psql -tAd "$DRILL" -c "select count(*) || ' ' || md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from $t x" 2>/dev/null || echo "missing")
  if [ "$live" = "$back" ]; then printf '  PASS %-30s %s rows, identical\n' "$t" "${live%% *}"
  else printf '  FAIL %-30s %s in, %s back\n' "$t" "${live%% *}" "${back%% *}"; status=1; fi
done
# And the rules came back with the rows: every policy, function and trigger,
# and row level security still switched on.
while IFS='|' read -r label what; do
  live=$(psql -tAd "$DB" -c "$what"); back=$(psql -tAd "$DRILL" -c "$what")
  if [ "$live" = "$back" ]; then printf '  PASS %-34s %s\n' "$label" "$live"
  else printf '  FAIL %-34s %s in, %s back\n' "$label" "$live" "$back"; status=1; fi
done <<'CHECKS'
policies|select count(*) from pg_policies where schemaname = 'public'
functions|select count(*) from pg_proc p where pronamespace = 'public'::regnamespace and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
triggers|select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relnamespace = 'public'::regnamespace and not t.tgisinternal
tables with row level security|select count(*) from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relrowsecurity
what the anon key may run|select md5(string_agg(p.oid::regprocedure::text, ',' order by p.oid::regprocedure::text)) from pg_proc p where pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute') and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
what a signed-in account may run|select md5(string_agg(p.oid::regprocedure::text, ',' order by p.oid::regprocedure::text)) from pg_proc p where pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', p.oid, 'execute') and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
CHECKS
echo "  ($count tables)"
"$BIN/dropdb" "$DRILL"; rm -f "$DUMP"
[ $status = 0 ] && echo "BACKUP RESTORES" || echo "BACKUP DOES NOT RESTORE"
exit $status
