#!/usr/bin/env bash
# Fresh-install test runner for the KpnIdentity schema (kpnidentity/migrations, kpnidentity/tests).
# Spins a throwaway Postgres, applies every migration from empty, runs every suite. Never touches a real
# Supabase project. Container is removed on exit unless LV_KEEP=1.
set -u
cd "$(dirname "$0")/.." || exit 2

IMAGE="${LV_DB_TEST_IMAGE:-postgres:15-alpine}"
NAME="kpni-test-$$"
MIG=kpnidentity/migrations
TESTS=kpnidentity/tests

cleanup() { [ -n "${LV_KEEP:-}" ] || docker rm -f "$NAME" >/dev/null 2>&1; }
trap cleanup EXIT

docker run -d --name "$NAME" -e POSTGRES_PASSWORD=localtest -e POSTGRES_DB=kpni "$IMAGE" >/dev/null || exit 2
for i in $(seq 1 60); do
  docker exec "$NAME" psql -U postgres -d kpni -X -At -c "select 1" >/dev/null 2>&1 && break
  sleep 1
  if [ "$i" = "60" ]; then echo "database never became ready"; exit 2; fi
done

q() { docker exec -i "$NAME" psql -U postgres -d kpni -X -q -v ON_ERROR_STOP=1 "$@"; }

q < "$TESTS/setup.sql" >/tmp/kpni-setup.$$ 2>&1 || { echo "setup failed"; cat /tmp/kpni-setup.$$; exit 2; }
for f in $(ls "$MIG"/[0-9][0-9][0-9][0-9][0-9][0-9]_*.sql | sort); do
  q < "$f" >/tmp/kpni-mig.$$ 2>&1 || { echo "MIGRATION FAILED: $f"; cat /tmp/kpni-mig.$$; exit 2; }
  echo "   applied $(basename "$f")"
done

PASS=0; FAIL=0
for f in $(ls "$TESTS"/[0-9][0-9]_*.sql | sort); do
  out=$(q < "$f" 2>&1) || { echo "ERROR in $(basename "$f")"; echo "$out" | tail -12; FAIL=$((FAIL+1)); continue; }
  p=$(echo "$out" | grep -c 'LVCHECK|PASS'); x=$(echo "$out" | grep -c 'LVCHECK|FAIL')
  PASS=$((PASS+p)); FAIL=$((FAIL+x))
  [ "$x" -gt 0 ] && { echo "FAILURES in $(basename "$f")"; echo "$out" | grep 'LVCHECK|FAIL'; }
done

# Smoke script (the post-deploy check) must pass on the freshly migrated database.
smoke=$(q -At -F'|' < kpnidentity/smoke.sql 2>&1) || { echo "SMOKE ERROR"; echo "$smoke" | tail -8; FAIL=$((FAIL+1)); }
if echo "$smoke" | grep -q '|f$'; then echo "SMOKE FAILED"; echo "$smoke"; FAIL=$((FAIL+1)); else PASS=$((PASS+1)); fi

# Rollback rehearsal: down removes kpni and its auth.users triggers, and up applies again cleanly.
q < kpnidentity/rollbacks/000001_kpni_core.down.sql >/dev/null 2>&1 || { echo "ROLLBACK FAILED"; FAIL=$((FAIL+1)); }
left=$(q -At -c "select (select count(*) from pg_namespace where nspname='kpni') + (select count(*) from pg_trigger where tgname like 'kpni_on_auth_user%')")
if [ "$left" = "0" ]; then PASS=$((PASS+1)); else echo "rollback left $left kpni object(s)"; FAIL=$((FAIL+1)); fi
q < "$MIG/000001_kpni_core.sql" >/dev/null 2>&1 && PASS=$((PASS+1)) || { echo "re-apply after rollback failed"; FAIL=$((FAIL+1)); }

echo "checks: $((PASS+FAIL)), failed: $FAIL"
[ "$FAIL" = "0" ]
