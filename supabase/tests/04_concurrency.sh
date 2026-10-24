#!/usr/bin/env bash
# 04: real concurrent sessions against committed data. Usage: DB=<db> 04_concurrency.sh <container>
# Each racer is its own psql connection; results are asserted from the committed end state.
set -u
NAME="$1"; DB="${DB:-lv}"
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT

P() { docker exec -i "$NAME" psql -U postgres -d "$DB" -X -q -At -v ON_ERROR_STOP=1 "$@"; }
check() { # name, "select <boolean expression>"
  P -c "insert into t.results (file, name, ok) select '04_concurrency', \$n\$$1\$n\$, coalesce(($2), false)" >/dev/null
}
as_user() { # uid, sql  (one fresh connection, runs as the API role)
  P -c "set role authenticated" -c "set request.jwt.claim.sub = '$1'" -c "$2"
}
# psql -c runs each -c separately in one session; role/GUC persist within the session.

A=$(P -c "select id from public.orgs where slug='LionCafe'")
B='00000000-0000-4000-8001-0000000000b2'
U() { printf '00000000-0000-4000-8002-%012d' "$1"; }

# Fixtures (committed): outsiders u21..u28 from a non-Hub org, Hub B public + approval.
P <<SQL >/dev/null
insert into public.orgs (id, slug, name) values ('00000000-0000-4000-8001-0000000000c3', 'synthetic-three', 'Synthetic Org Three');
insert into auth.users (id, email, raw_user_meta_data)
  select ('00000000-0000-4000-8002-' || lpad(n::text, 12, '0'))::uuid, 'racer' || n || '@example.invalid',
         jsonb_build_object('display_name', 'Racer ' || n, 'org_id', '00000000-0000-4000-8001-0000000000c3')
  from generate_series(21, 30) n;
SQL

echo "-- race 1: eight concurrent backfills of the same organization"
for i in 1 2 3 4 5 6 7 8; do
  P -c "select (lv_private.backfill_org_hub('$A', '$(U 2)')->>'memberships_created')" >"$OUT/bf.$i" 2>&1 &
done
wait
check "concurrent backfills produce exactly one Hub" "select (select count(*) from lv_private.hubs where id = '$A') = 1"
check "concurrent backfills produce exactly six memberships" "select (select count(*) from lv_private.hub_memberships where hub_id = '$A') = 6"
check "concurrent backfills create each membership once (sum of reports = 6)" "select $(cat "$OUT"/bf.* | paste -sd+ -) = 6"
check "concurrent backfills never fail" "select $(cat "$OUT"/bf.* | grep -ciE 'error|exception') = 0"
P -c "select lv_private.backfill_org_hub('$B', '$(U 11)'); update lv_private.hubs set visibility='public', membership_mode='approval' where id='$B'" >/dev/null

echo "-- race 2: twelve concurrent joins by the same person"
for i in $(seq 1 12); do
  as_user "$(U 21)" "select public.lv_join_hub('$B')->'data'->>'status'" >"$OUT/j.$i" 2>&1 &
done
wait
check "same-person concurrent joins leave exactly one row" "select (select count(*) from lv_private.hub_memberships where hub_id='$B' and account_id='$(U 21)') = 1"
check "same-person concurrent joins all answer pending" "select $(cat "$OUT"/j.* | grep -c '^pending$') = 12"

echo "-- race 3: nine different people join at once"
for n in $(seq 21 28) 29; do
  as_user "$(U $n)" "select public.lv_join_hub('$B')->'data'->>'status'" >"$OUT/m.$n" 2>&1 &
done
wait
check "nine concurrent applicants produce nine pending rows" "select (select count(*) from lv_private.hub_memberships where hub_id='$B' and status='pending') = 9"
check "accounts are created once per person" "select (select count(*) from lv_private.accounts where id in (select t.u(n) from generate_series(21,29) n)) = 9"

echo "-- race 4: conflicting decisions on one application (3 accept vs 3 reject)"
for i in 1 2 3; do
  as_user "$(U 11)" "select public.lv_decide_join('$B','$(U 22)','accept')->>'ok' || ':' || coalesce(public.lv_decide_join('$B','$(U 22)','accept')->'error'->>'code','')" >"$OUT/da.$i" 2>&1 &
  as_user "$(U 11)" "select public.lv_decide_join('$B','$(U 23)','reject')->>'ok'" >"$OUT/dr.$i" 2>&1 &
done
wait
check "racing accepts: exactly one winner, final state accepted" "select (select status from lv_private.hub_memberships where hub_id='$B' and account_id='$(U 22)') = 'accepted'"
check "racing rejects: application removed exactly once" "select not exists (select 1 from lv_private.hub_memberships where hub_id='$B' and account_id='$(U 23)')"
check "racing rejects: exactly one reject succeeded" "select $(cat "$OUT"/dr.* | grep -c '^true$') = 1"
check "race on one application: one accept event, not three" "select (select count(*) from lv_private.hub_membership_events where hub_id='$B' and account_id='$(U 22)' and to_status='accepted') = 1"

echo "-- race 5: ten first-time calls by a brand-new identity"
P -c "delete from lv_private.account_identities where auth_user_id='$(U 30)'; delete from lv_private.accounts where id='$(U 30)'" >/dev/null
for i in $(seq 1 10); do
  as_user "$(U 30)" "select public.lv_my_context()->'data'->'account'->>'id'" >"$OUT/c.$i" 2>&1 &
done
wait
check "concurrent first use creates exactly one account" "select (select count(*) from lv_private.account_identities where auth_user_id='$(U 30)') = 1"
check "every racer saw the same account id" "select $(cat "$OUT"/c.* | sort -u | grep -c .) = 1"

echo "-- race 6: Owner stays protected while members churn concurrently"
for i in $(seq 1 6); do
  as_user "$(U 11)" "select public.lv_suspend_member('$B','$(U 11)')->'error'->>'code'" >"$OUT/o.$i" 2>&1 &
done
wait
check "Owner is never suspended under concurrent attempts" "select (select status from lv_private.hub_memberships where hub_id='$B' and account_id='$(U 11)') = 'accepted'"
check "every attempt on the Owner was refused" "select $(cat "$OUT"/o.* | grep -c '^lv_forbidden$') = 6"
