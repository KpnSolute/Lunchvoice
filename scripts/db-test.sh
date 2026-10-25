#!/usr/bin/env bash
# Runs the v2 database tests against a THROWAWAY Postgres in Docker. Never touches a real Supabase project.
#
# 1. replays the repository's legacy migrations (everything not listed in supabase/tests/v2-migrations.txt)
# 2. seeds a synthetic legacy population and fingerprints it
# 3. applies the v2 migrations (so tests see "production plus the PR")
# 4. runs the SQL tests (each in a rolled-back transaction), a concurrency test, and the rollback test
#
# Usage: scripts/db-test.sh            (needs Docker; ~1 minute)
set -u
cd "$(dirname "$0")/.."

NAME="lv-db-test-$$"
IMAGE="${LV_DB_TEST_IMAGE:-postgres:15-alpine}"
MIG=supabase/migrations
TESTS=supabase/tests
ROLLBACKS=supabase/rollbacks

cleanup() { [ -n "${LV_KEEP:-}" ] || docker rm -f "$NAME" >/dev/null 2>&1; }
trap cleanup EXIT

command -v docker >/dev/null || { echo "docker is required" >&2; exit 2; }
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=localtest -e POSTGRES_DB=lv "$IMAGE" >/dev/null || exit 2
for _ in $(seq 1 90); do
  if docker logs "$NAME" 2>&1 | grep -q "PostgreSQL init process complete" && docker exec "$NAME" pg_isready -U postgres -d lv >/dev/null 2>&1; then break; fi
  sleep 1
done
sleep 1

q()  { docker exec -i "$NAME" psql -U postgres -d "${DB:-lv}" -X -q -v ON_ERROR_STOP=1 "$@"; }
FAILED=0

echo "== harness"
q < "$TESTS/setup.sql" >/dev/null || { echo "setup failed" >&2; exit 2; }

echo "== replaying legacy migrations"
for f in $(ls "$MIG" | sort); do
  grep -qx "$f" "$TESTS/v2-migrations.txt" && continue
  # The baseline is a schema dump that references is_admin() before defining it; production already has it.
  stop=1; case "$f" in 0001_*) stop=0;; esac
  if ! docker exec -i "$NAME" psql -U postgres -d lv -X -q -v ON_ERROR_STOP=$stop < "$MIG/$f" >/tmp/lv-mig.$$ 2>&1; then
    echo "legacy migration failed: $f" >&2; cat /tmp/lv-mig.$$ >&2; rm -f /tmp/lv-mig.$$; exit 2
  fi
done
rm -f /tmp/lv-mig.$$

echo "== seeding synthetic legacy data"
q < "$TESTS/legacy_seed.sql" || { echo "seed failed" >&2; exit 2; }
q -c "insert into t.snapshot values ('pre', t.legacy_fingerprint())" || exit 2

echo "== applying v2 migrations"
while read -r f; do
  [ -z "$f" ] && continue
  q < "$MIG/$f" || { echo "v2 migration failed: $f" >&2; exit 2; }
done < "$TESTS/v2-migrations.txt"

# A pristine copy (no fixture helpers) to prove what the product schema itself does.
docker exec "$NAME" psql -U postgres -d postgres -X -q -c "create database lv_pure template lv" || exit 2
docker exec -i "$NAME" psql -U postgres -d lv_pure -X -q -v ON_ERROR_STOP=1 < "$TESTS/15_pure_schema.sql" >/dev/null || { echo "pristine-schema check failed to run" >&2; FAILED=1; }
q < "$TESTS/setup_after.sql" || { echo "setup_after failed" >&2; exit 2; }

# Independent copies so committing tests cannot disturb each other.
docker exec "$NAME" psql -U postgres -d postgres -X -q -c "create database lv_cc template lv" -c "create database lv_rb template lv" -c "create database lv_rb2 template lv" -c "create database lv_rb3 template lv" -c "create database lv_rb4 template lv" -c "create database lv_rb5 template lv" -c "create database lv_rb6 template lv" -c "create database lv_rb7 template lv" -c "create database lv_rb8 template lv" || exit 2

echo "== sql tests"
SQL_PASS=0; SQL_FAIL=0
for f in $(ls "$TESTS"/[0-9][0-9]_*.sql | sort); do
  case "$f" in *05_rollback*|*14_legacy_bridge_*|*15_pure_schema*) continue;; esac
  if ! docker exec -i "$NAME" psql -U postgres -d lv -X -q -v ON_ERROR_STOP=1 < "$f" >/tmp/lv-t.$$ 2>&1; then
    echo "ERROR in $f"; grep -v 'LVCHECK' /tmp/lv-t.$$ | head -20; FAILED=1
  fi
  p=$(grep -c 'LVCHECK|PASS|' /tmp/lv-t.$$); fl=$(grep -c 'LVCHECK|FAIL|' /tmp/lv-t.$$)
  SQL_PASS=$((SQL_PASS + p)); SQL_FAIL=$((SQL_FAIL + fl))
  echo "$(basename "$f"): $p passed, $fl failed"
  grep 'LVCHECK|FAIL|' /tmp/lv-t.$$ | sed 's/.*LVCHECK|FAIL|/FAIL /; s/|/ :: /'
done
# The legacy bridge test is streamed: fixtures, then the standalone read-only inventory script, then the assertions.
if ! cat "$TESTS/14_legacy_bridge_head.sql" supabase/bridge/legacy_inventory.sql "$TESTS/14_legacy_bridge_tail.sql" | docker exec -i "$NAME" psql -U postgres -d lv -X -q -v ON_ERROR_STOP=1 >/tmp/lv-t.$$ 2>&1; then
  echo "ERROR in 14_legacy_bridge (streamed)"; grep -v 'LVCHECK' /tmp/lv-t.$$ | head -20; FAILED=1
fi
p=$(grep -c 'LVCHECK|PASS|' /tmp/lv-t.$$); fl=$(grep -c 'LVCHECK|FAIL|' /tmp/lv-t.$$)
SQL_PASS=$((SQL_PASS + p)); SQL_FAIL=$((SQL_FAIL + fl))
echo "14_legacy_bridge (streamed): $p passed, $fl failed"
grep 'LVCHECK|FAIL|' /tmp/lv-t.$$ | sed 's/.*LVCHECK|FAIL|/FAIL /; s/|/ :: /'
rm -f /tmp/lv-t.$$

echo "== concurrency"
DB=lv_cc bash "$TESTS/04_concurrency.sh" "$NAME" || FAILED=1

D1="$ROLLBACKS/20261024000100_v2_identity_hubs_memberships.down.sql"
D2="$ROLLBACKS/20261024000200_v2_roles_capabilities_owner_transfer.down.sql"
D3="$ROLLBACKS/20261024000300_v2_entitlements_campaign_lifecycle.down.sql"
D4="$ROLLBACKS/20261024000400_v2_participation_receipts.down.sql"
D5="$ROLLBACKS/20261024000500_v2_privacy_safe_analytics.down.sql"
D6="$ROLLBACKS/20261024000600_v2_waitlist_hub_settings.down.sql"
D7="$ROLLBACKS/20261024000700_v2_legacy_bridge.down.sql"
D8="$ROLLBACKS/20261024000800_v2_identity_first.down.sql"
rbtest() { # label, database, post file, down scripts...
  local label="$1" db="$2" post="$3"; shift 3
  echo "== rollback ($label)"
  if ! cat "$TESTS/05_rollback_pre.sql" "$@" "$post" | docker exec -i "$NAME" psql -U postgres -d "$db" -X -q -v ON_ERROR_STOP=1 >/dev/null 2>/tmp/lv-rb.$$; then
    echo "ERROR in rollback test: $label"; cat /tmp/lv-rb.$$; FAILED=1
  fi
}
rbtest "everything, in reverse order" lv_rb "$TESTS/05_rollback_post.sql" "$D8" "$D7" "$D6" "$D5" "$D4" "$D3" "$D2" "$D1"
rbtest "migrations 5 to 2; migration 1 must keep working" lv_rb2 "$TESTS/05b_rollback_roles_only_post.sql" "$D8" "$D7" "$D6" "$D5" "$D4" "$D3" "$D2"
rbtest "migrations 5 to 3; migrations 1 and 2 must keep working" lv_rb3 "$TESTS/05c_rollback_campaigns_only_post.sql" "$D8" "$D7" "$D6" "$D5" "$D4" "$D3"
rbtest "migrations 5 and 4; migrations 1 to 3 must keep working" lv_rb4 "$TESTS/05d_rollback_participation_only_post.sql" "$D8" "$D7" "$D6" "$D5" "$D4"
rbtest "migrations 6 and 5; migrations 1 to 4 must keep working" lv_rb5 "$TESTS/05e_rollback_analytics_only_post.sql" "$D8" "$D7" "$D6" "$D5"
rbtest "migrations 7 and 6; migrations 1 to 5 must keep working" lv_rb6 "$TESTS/05f_rollback_settings_only_post.sql" "$D8" "$D7" "$D6"
rbtest "migrations 8 and 7; migrations 1 to 6 must keep working" lv_rb7 "$TESTS/05g_rollback_bridge_only_post.sql" "$D8" "$D7"
rbtest "migration 8 only; migrations 1 to 7 must keep working" lv_rb8 "$TESTS/05h_rollback_identity_only_post.sql" "$D8"
rm -f /tmp/lv-rb.$$

echo "== results"
TOTAL=$((SQL_PASS + SQL_FAIL)); BAD=$SQL_FAIL
for db in lv_cc lv_rb lv_rb2 lv_rb3 lv_rb4 lv_rb5 lv_rb6 lv_rb7 lv_rb8 lv_pure; do
  n=$(docker exec "$NAME" psql -U postgres -d $db -X -At -c "select count(*) from t.results")
  b=$(docker exec "$NAME" psql -U postgres -d $db -X -At -c "select count(*) from t.results where not ok")
  TOTAL=$((TOTAL + n)); BAD=$((BAD + b))
  docker exec "$NAME" psql -U postgres -d $db -X -At -F ' :: ' -c "select 'FAIL ' || file, name from t.results where not ok order by n"
done
echo "checks: $TOTAL, failed: $BAD"
[ "$BAD" -eq 0 ] && [ "$FAILED" -eq 0 ] && [ "$TOTAL" -gt 0 ] && { echo "PASS"; exit 0; }
echo "FAIL"; exit 1
