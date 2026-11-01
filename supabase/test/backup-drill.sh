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
# "schema public already exists" is the one expected complaint.
"$BIN/pg_restore" --no-owner --no-privileges --dbname="$DRILL" "$DUMP" 2>/dev/null || true

status=0
for t in auth.users families parents kids quests submissions rewards redemptions notes overrides allowance_entries; do
  live=$(psql -tAd "$DB" -c "select count(*) from $t")
  back=$(psql -tAd "$DRILL" -c "select count(*) from $t")
  if [ "$live" = "$back" ]; then printf '  PASS %-18s %s rows\n' "$t" "$live"
  else printf '  FAIL %-18s %s in, %s back\n' "$t" "$live" "$back"; status=1; fi
done
"$BIN/dropdb" "$DRILL"; rm -f "$DUMP"
[ $status = 0 ] && echo "BACKUP RESTORES" || echo "BACKUP DOES NOT RESTORE"
exit $status
