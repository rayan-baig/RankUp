#!/usr/bin/env bash
# Brings the whole local stack up, idempotently: Postgres, the schema, the mock
# API, and (with --cf) the Cloudflare Pages runtime serving the production build.
#
# Written because the sandbox this was developed in gets recycled, and doing
# these four things by hand every time is how you end up testing against a
# half-started stack and believing the result.
#
#   supabase/test/up.sh          # postgres + schema + mock API
#   supabase/test/up.sh --cf     # also build and serve through workerd on :8788
set -uo pipefail
cd "$(dirname "$0")/../.."
export PGHOST=/tmp PGPORT=55432 PGUSER=postgres

say() { printf '  %-22s %s\n' "$1" "$2"; }

# --- Postgres ---------------------------------------------------------------
if ! pg_isready -h /tmp -p 55432 >/dev/null 2>&1; then
  [ -d /var/tmp/rankup-pg ] || su postgres -c \
    "/usr/lib/postgresql/16/bin/initdb -D /var/tmp/rankup-pg -U postgres --auth=trust" >/dev/null 2>&1
  (cd /tmp && su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/tmp/rankup-pg \
     -o '-k /tmp -p 55432 -c listen_addresses=' -l /var/tmp/rankup-pg/log start") >/dev/null 2>&1
  for _ in $(seq 1 20); do pg_isready -h /tmp -p 55432 >/dev/null 2>&1 && break; sleep 0.5; done
fi
pg_isready -h /tmp -p 55432 >/dev/null 2>&1 || { echo "postgres would not start"; exit 1; }
say postgres "up on /tmp:55432"

# --- schema -----------------------------------------------------------------
# The mock server holds a connection, and `drop database` fails silently while
# it does — which then applies the schema on top of itself and fails confusingly.
stop_mock() {
  local pid
  pid=$(ps -eo pid,args | grep "[m]ock-server" | awk '{print $1}' | head -1)
  [ -n "${pid:-}" ] && kill -9 "$pid" 2>/dev/null && sleep 1
  return 0
}
stop_mock
if ./supabase/test/run.sh >/tmp/rankup-sql.log 2>&1; then
  say schema "applied, all SQL checks pass"
else
  say schema "FAILED — see /tmp/rankup-sql.log"; tail -5 /tmp/rankup-sql.log; exit 1
fi

# --- mock API ---------------------------------------------------------------
setsid nohup node supabase/test/mock-server.mjs > /tmp/rankup-mock.log 2>&1 < /dev/null &
for _ in $(seq 1 20); do curl -s -o /dev/null -m 1 http://localhost:54321/rest/v1/ && break; sleep 0.5; done
say "mock api" "http://localhost:54321"

# --- the app ----------------------------------------------------------------
if [ "${1:-}" = "--cf" ]; then
  npm run build >/tmp/rankup-build.log 2>&1 || { say build "FAILED"; tail -5 /tmp/rankup-build.log; exit 1; }
  say build "dist/ ready"
  [ -f /tmp/rankup-vapid.txt ] || node -e \
    "const k=require('web-push').generateVAPIDKeys();console.log(k.publicKey);console.log(k.privateKey)" \
    > /tmp/rankup-vapid.txt
  VP=$(sed -n 1p /tmp/rankup-vapid.txt); VS=$(sed -n 2p /tmp/rankup-vapid.txt)
  for pid in $(ps -eo pid,args | grep -E "[w]rangler|[w]orkerd" | awk '{print $1}'); do kill -9 "$pid" 2>/dev/null; done
  sleep 2
  setsid nohup npx wrangler pages dev dist --port 8788 --compatibility-flags nodejs_compat \
    --binding SUPABASE_URL=http://localhost:54321 \
    --binding SUPABASE_SERVICE_ROLE_KEY=service-role-key \
    --binding CRON_SECRET=test-cron-secret \
    --binding STRIPE_SECRET_KEY=sk_test_routing_only \
    --binding ANTHROPIC_API_KEY=sk-ant-test-routing-only \
    --binding VAPID_PUBLIC_KEY="$VP" \
    --binding VAPID_PRIVATE_KEY="$VS" \
    --binding VAPID_SUBJECT=mailto:test@example.com \
    > /tmp/rankup-wrangler.log 2>&1 < /dev/null &
  for _ in $(seq 1 60); do curl -s -o /dev/null -m 1 http://localhost:8788/ && break; sleep 1; done
  say cloudflare "http://localhost:8788 (workerd, production build)"
else
  setsid nohup npm run dev -- --host --port 5173 > /tmp/rankup-vite.log 2>&1 < /dev/null &
  for _ in $(seq 1 30); do curl -s -o /dev/null -m 1 http://localhost:5173/ && break; sleep 0.5; done
  say vite "http://localhost:5173"
fi
