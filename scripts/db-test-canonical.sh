#!/usr/bin/env bash
# Fresh-install test runner for the CANONICAL v2 baseline.
#
# Spins a throwaway Postgres, applies ONLY the canonical migrations (0000NN_v2_*.sql), then runs every
# supabase/tests/NN_*.sql suite. It intentionally does NOT apply the legacy public/ migrations in the same
# directory: the canonical baseline must become a valid installation from an EMPTY database.
#
# Never touches a real Supabase project. Container is removed on exit unless LV_KEEP=1.
set -u
cd "$(dirname "$0")/.." || exit 2

IMAGE="${LV_DB_TEST_IMAGE:-postgres:15-alpine}"
NAME="lv-canon-$$"
MIG=supabase/migrations
TESTS=supabase/tests

cleanup() { [ -n "${LV_KEEP:-}" ] || docker rm -f "$NAME" >/dev/null 2>&1; }
trap cleanup EXIT

echo "== canonical baseline: $(ls "$MIG"/[0-9][0-9][0-9][0-9][0-9][0-9]_*.sql 2>/dev/null | wc -l) migrations"

docker run -d --name "$NAME" -e POSTGRES_PASSWORD=localtest -e POSTGRES_DB=lv "$IMAGE" >/dev/null || exit 2
# Wait for the database to actually accept connections, not merely for the container to start.
for i in $(seq 1 60); do
  docker exec "$NAME" psql -U postgres -d lv -X -At -c "select 1" >/dev/null 2>&1 && break
  sleep 1
  if [ "$i" = "60" ]; then echo "database never became ready"; exit 2; fi
done

q() { docker exec -i "$NAME" psql -U postgres -d lv -X -q -v ON_ERROR_STOP=1 "$@"; }
qdb() { local db="$1"; shift; docker exec -i "$NAME" psql -U postgres -d "$db" -X -q -v ON_ERROR_STOP=1 "$@"; }

# 1. Harness first (roles, helpers).
if ! q < "$TESTS/setup.sql" >/tmp/lv-canon-setup.$$ 2>&1; then
  echo "setup failed"; cat /tmp/lv-canon-setup.$$; exit 2
fi

# 2. Canonical migrations, in filename order, from empty.
for f in $(ls "$MIG"/[0-9][0-9][0-9][0-9][0-9][0-9]_*.sql | sort); do
  if ! q < "$f" >/tmp/lv-canon-mig.$$ 2>&1; then
    echo "MIGRATION FAILED: $f"; cat /tmp/lv-canon-mig.$$; exit 2
  fi
  echo "   applied $(basename "$f")"
done

# 3. Suites. Each suite runs inside begin/rollback, so its rows never persist: count the emitted notices.
SQL_PASS=0; SQL_FAIL=0
for f in $(ls "$TESTS"/[0-9][0-9]_*.sql 2>/dev/null | sort); do
  out=$(q < "$f" 2>&1)
  if [ $? -ne 0 ]; then
    echo "ERROR in $(basename "$f")"; echo "$out" | grep -v '^LVCHECK' | grep -vE '^NOTICE:  (check|as_|trust)|^ *$|^ *check|^-+|^\(1 row\)' | tail -12
    SQL_FAIL=$((SQL_FAIL+1)); continue
  fi
  p=$(echo "$out" | grep -c 'LVCHECK|PASS'); x=$(echo "$out" | grep -c 'LVCHECK|FAIL')
  SQL_PASS=$((SQL_PASS + p)); SQL_FAIL=$((SQL_FAIL + x))
  [ "$x" -gt 0 ] && { echo "FAILURES in $(basename "$f")"; echo "$out" | grep 'LVCHECK|FAIL'; }
done

# 3b. Parallel slug race: two real connections claim the same Hub slug at the same instant. A controller
# session holds an advisory lock while both clients queue on it; releasing it starts them together.
echo "== parallel slug race"
RACE_FAIL=0
RACE_SLUG="race-hub"
q -c "create database lv_race" >/dev/null 2>&1 || { echo "   could not create race database"; RACE_FAIL=1; }
if [ "$RACE_FAIL" = "0" ]; then
  qdb lv_race < "$TESTS/setup.sql" >/dev/null 2>&1 || RACE_FAIL=1
  for f in $(ls "$MIG"/[0-9][0-9][0-9][0-9][0-9][0-9]_*.sql | sort); do
    qdb lv_race < "$f" >/dev/null 2>&1 || { echo "   race database migration failed: $f"; RACE_FAIL=1; break; }
  done
fi
if [ "$RACE_FAIL" = "0" ]; then
  qdb lv_race >/dev/null 2>&1 <<'SQL' || RACE_FAIL=1
select t.trust_test_issuer();
select t.as_kpn(1); select lv_api.lv_my_context();
select t.as_kpn(2); select lv_api.lv_my_context();
select t.as_pg();
insert into lv.beta_applications (account_id, status) select id, 'approved' from lv.accounts;
SQL
fi
if [ "$RACE_FAIL" = "0" ]; then
  ( docker exec -i "$NAME" psql -U postgres -d lv_race -X -q -At >/dev/null 2>&1 <<'SQL'
select pg_advisory_lock(424242);
select pg_sleep(3);
select pg_advisory_unlock(424242);
SQL
  ) &
  CONTROLLER=$!
  sleep 1
  for n in 1 2; do
    ( docker exec -i "$NAME" psql -U postgres -d lv_race -X -q -At > "/tmp/lv-race-$n.$$" 2>&1 <<SQL
select t.as_kpn($n);
select pg_advisory_lock_shared(424242);
select 'RESULT|' || t.code(lv_api.lv_hub_create('$RACE_SLUG', 'Race $n'));
SQL
    ) &
  done
  wait
  OKS=$(cat /tmp/lv-race-1.$$ /tmp/lv-race-2.$$ | grep -c '^RESULT|ok$')
  CONFLICTS=$(cat /tmp/lv-race-1.$$ /tmp/lv-race-2.$$ | grep -c '^RESULT|lv_conflict$')
  HUBS=$(qdb lv_race -At -c "select count(*) from lv.hubs where slug = '$RACE_SLUG'" 2>/dev/null)
  CONSUMED=$(qdb lv_race -At -c "select count(*) from lv.beta_applications where status = 'consumed'" 2>/dev/null)
  OWNERS=$(qdb lv_race -At -c "select count(*) from lv.hubs h join lv.hub_memberships m on m.hub_id = h.id and m.account_id = h.owner_account_id and m.status = 'accepted' where h.slug = '$RACE_SLUG'" 2>/dev/null)
  echo "   winners=$OKS conflicts=$CONFLICTS hubs=$HUBS approvals_consumed=$CONSUMED owner_memberships=$OWNERS"
  if [ "$OKS" = "1" ] && [ "$CONFLICTS" = "1" ] && [ "$HUBS" = "1" ] && [ "$CONSUMED" = "1" ] && [ "$OWNERS" = "1" ]; then
    echo "   exactly one claimant won; the loser got lv_conflict and kept its approval"
  else
    echo "   RACE FAILED"; cat /tmp/lv-race-1.$$ /tmp/lv-race-2.$$ | head -10; RACE_FAIL=1
  fi
  kill "$CONTROLLER" 2>/dev/null
  rm -f /tmp/lv-race-1.$$ /tmp/lv-race-2.$$
fi

echo "== results"
echo "checks: $((SQL_PASS + SQL_FAIL)), failed: $SQL_FAIL"

# 4. Rollback rehearsal: apply the whole baseline on a second database, then run every rollback in reverse.
echo "== rollback rehearsal"
RB_FAIL=0
q -c "create database lv_rb" >/dev/null 2>&1 || { echo "   could not create rollback database"; RB_FAIL=1; }
apply_to() { local db="$1"; shift; for f in "$@"; do qdb "$db" < "$f" >/dev/null 2>/tmp/lv-rb.$$ || { echo "rollback FAILED at $(basename "$f")"; cat /tmp/lv-rb.$$; RB_FAIL=1; return 1; }; done; }
MIGFILES=$(ls "$MIG"/[0-9][0-9][0-9][0-9][0-9][0-9]_*.sql | sort)
DOWNFILES=$(ls supabase/rollbacks/*.down.sql 2>/dev/null | sort -r)
if [ -n "$DOWNFILES" ]; then
  if apply_to lv_rb $MIGFILES; then
    if apply_to lv_rb $DOWNFILES; then
      echo "   full baseline applied and fully rolled back"
    fi
  fi
  # After a complete rollback the v2 schemas must be gone.
  remains=$(docker exec "$NAME" psql -U postgres -d lv_rb -X -At -c "select count(*) from information_schema.schemata where schema_name in ('lv','lv_api')" 2>/dev/null)
  if [ "${remains:-1}" != "0" ]; then echo "   rollback incomplete: v2 schemas still present ($remains)"; RB_FAIL=1; fi
else
  echo "   no rollback files"; RB_FAIL=1
fi
rm -f /tmp/lv-rb.$$

rm -f /tmp/lv-canon-setup.$$ /tmp/lv-canon-mig.$$
# A zero-check run is a harness failure, not a pass: guard against a false green.
if [ "$((SQL_PASS + SQL_FAIL))" = "0" ]; then echo "FAIL (no checks ran)"; exit 1; fi
if [ "$SQL_FAIL" = "0" ] && [ "$RB_FAIL" = "0" ] && [ "$RACE_FAIL" = "0" ]; then echo PASS; else echo FAIL; exit 1; fi
