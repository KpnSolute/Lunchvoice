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

echo "checks: $((PASS+FAIL)), failed: $FAIL"
[ "$FAIL" = "0" ]
