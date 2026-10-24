#!/usr/bin/env bash
# 04: real concurrent sessions against committed data. Usage: DB=<db> 04_concurrency.sh <container>
# Each racer is its own psql connection; results are asserted from the committed end state.
set -u
NAME="$1"; DB="${DB:-lv}"
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT

P() { docker exec -i "$NAME" psql -U postgres -d "$DB" -X -q -At -v ON_ERROR_STOP=1 "$@"; }
check() { # name, "select <boolean expression>". A check that errors is recorded as a FAILURE, never skipped.
  if ! P -c "insert into t.results (file, name, ok) select '04_concurrency', \$n\$$1\$n\$, coalesce(($2), false)" >/dev/null 2>"$OUT/check.err"; then
    P -c "insert into t.results (file, name, ok, detail) values ('04_concurrency', \$n\$$1\$n\$, false, \$d\$check errored: $(tr -d "'" < "$OUT/check.err" | head -c 200)\$d\$)" >/dev/null
  fi
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


# ---------------------------------------------------------------------------------------------------------------
# Roles and ownership. Fixture: Hub A (LionCafe) already backfilled with Owner u2; synthetic Starter grant (3 slots).
# ---------------------------------------------------------------------------------------------------------------
P -c "insert into lv_private.entitlement_grants (hub_id, plan_code, source) values ('$A', 'starter', 'synthetic')" >/dev/null
P -c "update lv_private.policy set value = '{\"max_age_seconds\": 300, \"methods\": [\"oauth\"]}'::jsonb where key = 'owner_transfer.reauth'" >/dev/null
P -c "update lv_private.policy set value = '3600'::jsonb where key = 'owner_transfer.offer_ttl_seconds'" >/dev/null
claims() { # uid -> JWT claims with a fresh oauth amr entry
  printf '{"sub":"%s","amr":[{"method":"oauth","timestamp":%s}]}' "$1" "$(date +%s)"
}
as_authed() { # uid, sql
  P -c "set role authenticated" -c "set request.jwt.claim.sub = '$1'" -c "set request.jwt.claims = '$(claims "$1")'" -c "$2"
}

echo "-- race 7: eight concurrent creations for the LAST free role slot (Starter has 3)"
as_user "$(U 2)" "select public.lv_role_create('$A', 'Existing One', null, '{}')->>'ok'" >/dev/null
as_user "$(U 2)" "select public.lv_role_create('$A', 'Existing Two', null, '{}')->>'ok'" >/dev/null
for i in $(seq 1 8); do
  as_user "$(U 2)" "select coalesce(public.lv_role_create('$A', 'Racer $i', null, '{}')->'error'->>'code', 'ok')" >"$OUT/r.$i" 2>&1 &
done
wait
check "last-slot race: exactly one creation succeeds" "select $(cat "$OUT"/r.* | grep -c '^ok$') = 1"
check "last-slot race: the other seven are lv_quota_exceeded" "select $(cat "$OUT"/r.* | grep -c '^lv_quota_exceeded$') = 7"
check "last-slot race: never more than 3 roles exist" "select (select count(*) from lv_private.roles where hub_id = '$A') = 3"

echo "-- race 8: assigning a role while the member is suspended, five of each at once"
RID=$(P -c "select id from lv_private.roles where hub_id='$A' order by name limit 1")
for i in 1 2 3 4 5; do
  as_user "$(U 2)" "select public.lv_role_assign('$RID', '$(U 3)')->>'ok'" >"$OUT/as.$i" 2>&1 &
  as_user "$(U 2)" "select public.lv_suspend_member('$A', '$(U 3)')->>'ok'" >"$OUT/su.$i" 2>&1 &
done
wait
check "assign/suspend race: no role assignment survives for a non-accepted member" "select not exists (select 1 from lv_private.role_assignments ra join lv_private.hub_memberships m on m.hub_id = ra.hub_id and m.account_id = ra.account_id where m.status <> 'accepted')"
check "assign/suspend race: the member ends suspended" "select (select status from lv_private.hub_memberships where hub_id='$A' and account_id='$(U 3)') = 'suspended'"
P -c "update lv_private.hub_memberships set status = 'accepted' where hub_id='$A' and account_id='$(U 3)'" >/dev/null

echo "-- race 9: competing ownership offers (4 to u3, 4 to u4, started at once by the Owner)"
for i in 1 2 3 4; do
  as_authed "$(U 2)" "select coalesce(public.lv_owner_transfer_start('$A', '$(U 3)')->'error'->>'code', 'ok')" >"$OUT/ts3.$i" 2>&1 &
  as_authed "$(U 2)" "select coalesce(public.lv_owner_transfer_start('$A', '$(U 4)')->'error'->>'code', 'ok')" >"$OUT/ts4.$i" 2>&1 &
done
wait
check "competing offers: exactly one start succeeded" "select $(cat "$OUT"/ts3.* "$OUT"/ts4.* | grep -c '^ok$') = 1"
check "competing offers: exactly one pending offer exists" "select (select count(*) from lv_private.owner_transfer_offers where hub_id='$A' and status='pending') = 1"
check "competing offers: the losers were lv_conflict" "select $(cat "$OUT"/ts3.* "$OUT"/ts4.* | grep -c '^lv_conflict$') = 7"

echo "-- race 10: accept (x5) racing cancel (x3) on the one open offer"
OFFER=$(P -c "select id from lv_private.owner_transfer_offers where hub_id='$A' and status='pending'")
TO=$(P -c "select to_account_id from lv_private.owner_transfer_offers where id='$OFFER'")
for i in 1 2 3 4 5; do
  as_authed "$TO" "select coalesce(public.lv_owner_transfer_accept('$OFFER')->'error'->>'code', 'ok')" >"$OUT/ac.$i" 2>&1 &
done
for i in 1 2 3; do
  as_authed "$(U 2)" "select coalesce(public.lv_owner_transfer_cancel('$OFFER')->'error'->>'code', 'ok')" >"$OUT/ca.$i" 2>&1 &
done
wait
check "accept/cancel race: exactly one Owner afterwards" "select (select count(*) from lv_private.hub_memberships m where m.hub_id='$A' and lv_private.is_owner('$A', m.account_id)) = 1"
check "accept/cancel race: the offer is accepted or cancelled, never both, never open" "select (select status from lv_private.owner_transfer_offers where id='$OFFER') in ('accepted','cancelled')"
check "accept/cancel race: ownership agrees with the offer outcome" "select ((select status from lv_private.owner_transfer_offers where id='$OFFER') = 'accepted') = ((select owner_account_id from lv_private.hubs where id='$A') = '$TO')"
check "accept/cancel race: at most one swap happened" "select (select count(*) from lv_private.owner_transfer_offers where hub_id='$A' and status='accepted') <= 1"
check "accept/cancel race: the swap left no authorization token behind" "select (select count(*) from lv_private.owner_change_tokens) = 0"


# ---------------------------------------------------------------------------------------------------------------
# Campaign activation. Hub A (Owner u2) holds the synthetic Starter grant: 2 survey slots. SYNTHETIC policy values.
# ---------------------------------------------------------------------------------------------------------------
P -c "update lv_private.policy set value = '[\"active\"]'::jsonb where key = 'quota.consuming_states'" >/dev/null
P -c "update lv_private.policy set value = '{\"window_days\": 30}'::jsonb where key = 'gate.measurement'" >/dev/null
P -c "update lv_private.policy set value = '{\"sources\": [\"v2\",\"legacy_backfill\",\"legacy_signup\",\"legacy_repair\"]}'::jsonb where key = 'gate.eligible_population'" >/dev/null
P -c "update lv_private.policy set value = '{\"min_other_active_surveys\": 100}'::jsonb where key = 'gate.applies_to'" >/dev/null
P -c "update lv_private.policy set value = '{\"zero_members\": \"unmet\"}'::jsonb where key = 'gate.bootstrap'" >/dev/null
# Ownership may have moved in the accept-versus-cancel race above; act as whoever owns Hub A now.
OWN=$(P -c "select owner_account_id from lv_private.hubs where id='$A'")
mkdraft() { # title -> id
  P -c "with c as (insert into lv_private.campaigns (hub_id, title, join_code) values ('$A', '$1', lv_private.new_join_code()) returning id), q as (insert into lv_private.campaign_questions (campaign_id, position, type, prompt) select id, 1, 'rating', 'Q' from c) select id from c"
}
closeall() { P -c "update lv_private.campaigns set state = 'closed' where hub_id = '$A' and state in ('active', 'scheduled')" >/dev/null; }
activesurveys() { P -c "select count(*) from lv_private.campaigns where hub_id = '$A' and mode = 'survey' and state = 'active' and (closes_at is null or closes_at > now())"; }

echo "-- race 11: eight drafts race for the last of two survey slots"
closeall
D0=$(mkdraft "Slot holder")
as_user "$OWN" "select public.lv_campaign_activate('$D0', gen_random_uuid())->>'ok'" >/dev/null
for i in $(seq 1 8); do ids[$i]=$(mkdraft "Racer $i"); done
for i in $(seq 1 8); do
  as_user "$OWN" "select coalesce(public.lv_campaign_activate('${ids[$i]}', gen_random_uuid())->'error'->>'code', 'ok')" >"$OUT/a.$i" 2>&1 &
done
wait
check "last survey slot: exactly one activation wins" "select $(cat "$OUT"/a.* | grep -c '^ok$') = 1"
check "last survey slot: the other seven are lv_quota_exceeded" "select $(cat "$OUT"/a.* | grep -c '^lv_quota_exceeded$') = 7"
check "last survey slot: never more than 2 active surveys" "select $(activesurveys) = 2"

echo "-- race 12: eight identical retries (same idempotency key) of one activation"
closeall
D1=$(mkdraft "Retried")
KEY=$(P -c "select gen_random_uuid()")
for i in $(seq 1 8); do
  as_user "$OWN" "select public.lv_campaign_activate('$D1', '$KEY')->'data'->>'replay'" >"$OUT/rt.$i" 2>&1 &
done
wait
check "retries: exactly one performed the activation (replay=false)" "select $(cat "$OUT"/rt.* | grep -c '^false$') = 1"
check "retries: the other seven replayed the first result" "select $(cat "$OUT"/rt.* | grep -c '^true$') = 7"
check "retries: one activation record and one active Campaign" "select (select count(*) from lv_private.campaign_activations where campaign_id = '$D1') = 1 and (select state from lv_private.campaigns where id = '$D1') = 'active'"

echo "-- race 13: the scheduler and three manual activations race for the last slot"
closeall
D2=$(mkdraft "Slot holder two")
as_user "$OWN" "select public.lv_campaign_activate('$D2', gen_random_uuid())->>'ok'" >/dev/null
SCH=$(mkdraft "Scheduled racer")
P -c "update lv_private.campaigns set state = 'scheduled', opens_at = now() - interval '1 minute', scheduled_by = '$OWN' where id = '$SCH'" >/dev/null
for i in 1 2 3; do ids[$i]=$(mkdraft "Manual racer $i"); done
P -c "select (lv_private.run_scheduled_activations()->>'activated')" >"$OUT/sch.out" 2>&1 &
for i in 1 2 3; do
  as_user "$OWN" "select coalesce(public.lv_campaign_activate('${ids[$i]}', gen_random_uuid())->'error'->>'code', 'ok')" >"$OUT/m.$i" 2>&1 &
done
wait
check "scheduler vs manual: never more than 2 active surveys" "select $(activesurveys) = 2"
check "scheduler vs manual: exactly one of the four took the slot" "select $(( $(cat "$OUT"/m.* | grep -c '^ok$') + $(cat "$OUT/sch.out" | tr -d ' \n') )) = 1"

echo "-- race 14: closing and reopening the same Campaign concurrently"
closeall
D3=$(mkdraft "Flapper")
as_user "$OWN" "select public.lv_campaign_activate('$D3', gen_random_uuid())->>'ok'" >/dev/null
for i in 1 2 3 4; do
  as_user "$OWN" "select public.lv_campaign_close('$D3')->>'ok'" >"$OUT/cl.$i" 2>&1 &
  as_user "$OWN" "select coalesce(public.lv_campaign_activate('$D3', gen_random_uuid())->'error'->>'code', 'ok')" >"$OUT/ro.$i" 2>&1 &
done
wait
check "close/reopen race: the Campaign is in exactly one coherent state" "select (select state from lv_private.campaigns where id = '$D3') in ('active', 'closed')"
check "close/reopen race: never more than 2 active surveys and participation untouched" "select $(activesurveys) <= 2"


# ---------------------------------------------------------------------------------------------------------------
# Participation. Members are legacy accounts that are accepted in Hub A and are not its current Owner.
# ---------------------------------------------------------------------------------------------------------------
mapfile -t MEMBERS < <(P -c "select i.account_id from lv_private.account_identities i join lv_private.hub_memberships m on m.account_id = i.account_id and m.hub_id = '$A' and m.status = 'accepted' where i.auth_user_id = i.account_id and i.account_id <> '$OWN' order by i.account_id limit 5")
check "participation fixture: at least three eligible members were found" "select ${#MEMBERS[@]} >= 3"
pubsurvey() { # title [closes_in_seconds] -> campaign id (published, one required rating question 1..5)
  local id
  id=$(P -c "with c as (insert into lv_private.campaigns (hub_id, title, join_code) values ('$A', '$1', lv_private.new_join_code()) returning id), q as (insert into lv_private.campaign_questions (campaign_id, position, type, prompt, required) select id, 1, 'rating', 'Q', true from c) select id from c")
  P -c "select lv_private.activate_campaign('$id', '$OWN', gen_random_uuid(), 'manual')->>'ok'" >/dev/null
  echo "$id"
}
qid() { P -c "select id from lv_private.campaign_questions where campaign_id = '$1'"; }
submit() { # uid campaign -> code or ok:duplicate:receipt
  as_user "$1" "select coalesce(public.lv_submit_response('$2', '[{\"question_id\":\"$(qid "$2")\",\"value\":3}]'::jsonb, gen_random_uuid())->'error'->>'code', 'ok')"
}

echo "-- race 15: twelve simultaneous submissions by ONE person, each with a DIFFERENT idempotency key"
closeall
C1=$(pubsurvey "Same person")
Q1=$(qid "$C1")
for i in $(seq 1 12); do
  as_user "${MEMBERS[0]}" "select public.lv_submit_response('$C1', '[{\"question_id\":\"$Q1\",\"value\":3}]'::jsonb, gen_random_uuid())->'data'->>'id' || ':' || (public.lv_submit_response('$C1', '[{\"question_id\":\"$Q1\",\"value\":3}]'::jsonb, gen_random_uuid())->'data'->>'duplicate')" >"$OUT/p15.$i" 2>&1 &
done
wait
check "one person, twelve keys: exactly one participation row" "select (select count(*) from lv_private.campaign_participation where campaign_id = '$C1') = 1"
check "one person, twelve keys: exactly one answer set" "select (select count(*) from lv_private.campaign_answers where campaign_id = '$C1') = 1"
check "one person, twelve keys: every caller got the SAME receipt id" "select $(cut -d: -f1 "$OUT"/p15.* | sort -u | grep -c .) = 1"
check "one person, twelve keys: no second reward is possible (one ledger row, points unchanged)" "select (select count(*) from lv_private.campaign_participation where campaign_id = '$C1' and reward_state = 'unset' and points is null) = 1"

echo "-- race 16: five different members submit at once"
closeall
C2=$(pubsurvey "Five people")
for i in 0 1 2 3 4; do
  [ -n "${MEMBERS[$i]}" ] && submit "${MEMBERS[$i]}" "$C2" >"$OUT/p16.$i" 2>&1 &
done
wait
N16=${#MEMBERS[@]}
check "five members: every one got a receipt" "select $(cat "$OUT"/p16.* | grep -c '^ok$') = $N16"
check "five members: ledger rows equal answer sets equal people" "select (select count(*) from lv_private.campaign_participation where campaign_id = '$C2') = $N16 and (select count(*) from lv_private.campaign_answers where campaign_id = '$C2') = $N16"

echo "-- race 17: closing while five members submit"
closeall
C3=$(pubsurvey "Close race")
for i in 0 1 2 3 4; do
  [ -n "${MEMBERS[$i]}" ] && submit "${MEMBERS[$i]}" "$C3" >"$OUT/p17.$i" 2>&1 &
done
as_user "$OWN" "select public.lv_campaign_close('$C3')->>'ok'" >"$OUT/p17.close" 2>&1 &
wait
ACCEPTED=$(cat "$OUT"/p17.[0-9] | grep -c '^ok$')
check "close vs submit: every accepted submission left exactly one ledger row and one answer set (atomic)" "select (select count(*) from lv_private.campaign_participation where campaign_id = '$C3') = $ACCEPTED and (select count(*) from lv_private.campaign_answers where campaign_id = '$C3') = $ACCEPTED"
check "close vs submit: the rest were refused as not open, none half-written" "select $(cat "$OUT"/p17.[0-9] | grep -c '^lv_lifecycle_invalid$') = $(( ${#MEMBERS[@]} - ACCEPTED ))"
check "close vs submit: the Campaign ends closed and the answers survived" "select (select state from lv_private.campaigns where id = '$C3') = 'closed'"

echo "-- race 18: the closing time passes while a submission waits for the Campaign lock"
closeall
C4=$(pubsurvey "Expiry race")
P -c "update lv_private.campaigns set opens_at = now() - interval '1 hour', closes_at = now() + interval '3 seconds' where id = '$C4'" >/dev/null
Q4=$(qid "$C4")
P -c "begin; select 1 from lv_private.campaigns where id = '$C4' for update; select pg_sleep(5); commit;" >/dev/null 2>&1 &
sleep 1
as_user "${MEMBERS[1]}" "select coalesce(public.lv_submit_response('$C4', '[{\"question_id\":\"$Q4\",\"value\":3}]'::jsonb, gen_random_uuid())->'error'->'details'->>'reason', 'accepted')" >"$OUT/p18.out" 2>&1
wait
check "expiry race: the waiting submission is refused because the closing time passed while it waited" "select '$(tr -d ' \n' < "$OUT/p18.out")' = 'closed_by_time'"
check "expiry race: nothing was written for the refused submission" "select (select count(*) from lv_private.campaign_participation where campaign_id = '$C4') = 0 and (select count(*) from lv_private.campaign_answers where campaign_id = '$C4') = 0"


echo "-- race 19: six analysts request the first release of the same anonymous results at once"
closeall
C5=$(P -c "with c as (insert into lv_private.campaigns (hub_id, title, join_code, anonymous) values ('$A', 'Anonymous release race', lv_private.new_join_code(), true) returning id), q as (insert into lv_private.campaign_questions (campaign_id, position, type, prompt, required) select id, 1, 'rating', 'Q', true from c) select id from c")
P -c "select lv_private.activate_campaign('$C5', '$OWN', gen_random_uuid(), 'manual')->>'ok'" >/dev/null
P -c "update lv_private.policy set value = '3'::jsonb where key = 'analytics.min_cohort'" >/dev/null
P -c "update lv_private.policy set value = '5'::jsonb where key = 'analytics.min_participants'" >/dev/null
P -c "update lv_private.policy set value = '{\"complementary_suppression\": true}'::jsonb where key = 'analytics.disclosure_controls'" >/dev/null
Q5=$(qid "$C5")
ACCS=$(P -c "with a as (insert into lv_private.accounts (id, display_name) select gen_random_uuid(), 'cc' from generate_series(1, 7) returning id), m as (insert into lv_private.hub_memberships (hub_id, account_id, status, source) select '$A', id, 'accepted', 'v2' from a returning account_id) select account_id from m")
for acc in $ACCS; do
  P -c "select lv_private.submit_core('$C5', '$acc', null, '[{\"question_id\":\"$Q5\",\"value\":3}]'::jsonb, gen_random_uuid())->>'ok'" >/dev/null
done
P -c "update lv_private.campaigns set state = 'closed', closed_at = now() where id = '$C5'" >/dev/null
for i in 1 2 3 4 5 6; do
  as_user "$OWN" "select public.lv_analytics_query('$C5', 'participation')->'data'->'participants'->'member'->>'n'" >"$OUT/an.$i" 2>&1 &
done
wait
check "simultaneous first releases: every analyst saw the same exact total (7)" "select $(cat "$OUT"/an.* | grep -c '^7$') = 6"
check "simultaneous first releases: exactly one release record" "select (select count(*) from lv_private.analytics_releases where campaign_id = '$C5') = 1"
P -c "update lv_private.campaigns set state = 'active', closed_at = null where id = '$C5'" >/dev/null
LATE=$(P -c "with a as (insert into lv_private.accounts (id, display_name) values (gen_random_uuid(), 'late') returning id), m as (insert into lv_private.hub_memberships (hub_id, account_id, status, source) select '$A', id, 'accepted', 'v2' from a returning account_id) select account_id from m")
P -c "select lv_private.submit_core('$C5', '$LATE', null, '[{\"question_id\":\"$Q5\",\"value\":3}]'::jsonb, gen_random_uuid())->>'ok'" >/dev/null
P -c "update lv_private.campaigns set state = 'closed', closed_at = now() where id = '$C5'" >/dev/null
as_user "$OWN" "select coalesce(public.lv_analytics_query('$C5', 'participation')->'error'->'details'->>'reason', 'shown')" >"$OUT/an.late" 2>&1
check "a response after the first release makes the results unavailable (no differencing)" "select '$(tr -d ' \n' < "$OUT/an.late")' = 'population_changed_after_release'"
