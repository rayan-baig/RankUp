#!/usr/bin/env bash
# Serves the production build and its /api functions under workerd on :8788,
# with the test settings the API suite expects.
#
# One list of settings, used by both supabase/test/up.sh --cf and CI. They
# were two copies; tests/api.mjs gained Stripe checks that need the price ids
# and STRIPE_API_BASE (its stand-in Stripe), up.sh was given them and CI's
# copy was not, so the suite passed locally and failed in CI.
#
# Expects dist/ to be built. Runs in the foreground; callers background it.
set -euo pipefail
cd "$(dirname "$0")/../.."

VAPID_FILE="${VAPID_FILE:-/tmp/rankup-vapid.txt}"
# One call, one PAIR: two calls would hand out keys from different pairs.
[ -s "$VAPID_FILE" ] || node -e \
  "const k=require('web-push').generateVAPIDKeys();console.log(k.publicKey);console.log(k.privateKey)" \
  > "$VAPID_FILE"
VP=$(sed -n 1p "$VAPID_FILE"); VS=$(sed -n 2p "$VAPID_FILE")

# FUNCTIONS_PORT and MOCK_URL let a second copy run beside another on one machine.
PORT="${FUNCTIONS_PORT:-8788}"
MOCK="${MOCK_URL:-http://localhost:54321}"
exec npx wrangler pages dev dist --port "$PORT" --compatibility-flags nodejs_compat \
  --binding SUPABASE_URL="$MOCK" \
  --binding VITE_SUPABASE_ANON_KEY=local-anon-key \
  --binding SUPABASE_SERVICE_ROLE_KEY=service-role-key \
  --binding CRON_SECRET=test-cron-secret \
  --binding OPERATOR_SECRET=test-operator-secret \
  --binding STATS_KEY=test-stats-key \
  --binding STRIPE_SECRET_KEY=sk_test_routing_only \
  --binding STRIPE_WEBHOOK_SECRET=whsec_test_local_only \
  --binding STRIPE_PRICE_STANDARD=price_test_standard_only \
  --binding STRIPE_PRICE_STANDARD_YEAR=price_test_standard_year \
  --binding STRIPE_PRICE_ELITE=price_test_elite_month \
  --binding STRIPE_PRICE_ELITE_YEAR=price_test_elite_year \
  --binding STRIPE_PRICE_FLASH_5=price_test_flash_5 \
  --binding STRIPE_PRICE_SCHOOL_SMALL=price_test_school_small \
  --binding STRIPE_PRICE_SCHOOL_SMALL_YEAR=price_test_school_small_year \
  --binding STRIPE_PRICE_SCHOOL_MEDIUM=price_test_school_medium \
  --binding STRIPE_PRICE_SCHOOL_MEDIUM_YEAR=price_test_school_medium_year \
  --binding STRIPE_PRICE_SCHOOL_LARGE=price_test_school_large \
  --binding STRIPE_PRICE_SCHOOL_LARGE_YEAR=price_test_school_large_year \
  --binding STRIPE_PRICE_SCHOOL_XL=price_test_school_xl \
  --binding STRIPE_PRICE_SCHOOL_XL_YEAR=price_test_school_xl_year \
  --binding STRIPE_API_BASE=http://localhost:12111 \
  --binding EMAIL_API_KEY=re_test_local_only \
  --binding EMAIL_FROM="RankUp <no-reply@rankup.example.test>" \
  --binding EMAIL_REPLY_TO=help@example.test \
  --binding EMAIL_API_BASE=http://localhost:12112 \
  --binding PUBLIC_SITE_URL="http://localhost:$PORT" \
  --binding VAPID_PUBLIC_KEY="$VP" \
  --binding VAPID_PRIVATE_KEY="$VS" \
  --binding VAPID_SUBJECT=mailto:test@example.com
