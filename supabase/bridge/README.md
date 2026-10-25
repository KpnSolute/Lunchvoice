# MJCC legacy bridge: runbook (rehearsal only)

**Status: nothing here has been applied to production.** The Hub keeps the name **LionCafe** and its existing organization id; there is no separate "MJCC Hub".
The bridge needs a verified real Owner for the production backfill and a separate authorization to run. It is operator-run SQL, not an API.

## 1. Read-only inventory (safe to run first)
`supabase/bridge/legacy_inventory.sql` reads only the legacy tables and writes nothing. Run it through a read-only connection to the production database and keep the one
result row. It classifies every LionCafe session:

| Class | Meaning | What the bridge does |
| --- | --- | --- |
| `mappable` | historical survey session with a valid template, questions, window and join code | archives it as a closed, read-only v2 record |
| `live_not_mapped` | still live in the legacy app | leaves it alone until a separately authorized cutover |
| `menu_session_not_mapped` | dish-rating (menu) session | leaves it in the legacy tables |
| `ambiguous` | missing/empty template, impossible scale, bad title length, backwards time window, empty or colliding join code | does nothing and lists it, with the reason, for a human decision |

It also counts responses per class, students with no profile in the organization, free text that is not copied, answers whose value type or question does not fit, and
points. **The author of this runbook has not run it against production** (no read-only production connection was available); it was exercised on synthetic data only.

## 2. Rehearsal (isolated, synthetic)
`npm run test:db` replays the migrations on a throwaway Postgres, builds a synthetic LionCafe history (13 sessions covering every class above), runs the standalone script,
runs the sync, and checks that: ids, join codes, times, answers and points are preserved; ambiguous records are listed and untouched; nothing legacy changes (byte-identical
fingerprint of every legacy table); archived records use no quota, no gate, no activation, no results; an interrupted sync leaves nothing partial; late legacy responses are
picked up; four syncs racing sixteen concurrent legacy writes lose nothing; rollback removes only the derived archive and a re-sync rebuilds it identically.

## 3. Before any production run (all separate approvals)
1. Founder authorizes the production migrations and the backfill.
2. The **verified real Owner** is named (never inferred from an email, title or admin role); `lv_private.backfill_org_hub(org_id, owner_account_id)` requires it.
3. A rehearsal on a copy of production (not a throwaway synthetic database) is reviewed against the inventory: `legacy_reconcile` must say `ok` and every ambiguous session needs a recorded decision or an accepted "leave it".
4. The PR #9 authenticated browser checks are complete (legacy sign-in, redemption and survey still work).

## 4. Running it (when authorized)
```sql
select lv_private.backfill_org_hub('<LionCafe org id>', '<verified Owner account id>');
select lv_private.legacy_sync_org('<LionCafe org id>');      -- repeatable; per-session atomic
select lv_private.legacy_reconcile('<LionCafe org id>');     -- read-only; "ok": true, ambiguous list, drift
```
Re-run `legacy_sync_org` as often as needed. Responses and answers that legacy students submit after a sync (the legacy app keeps running) are copied on the next run;
`legacy_reconcile` reports anything not yet carried over and any mapped session that is live again in the legacy app. Nothing schedules the sync.

## 5. Rollback
`select lv_private.legacy_unmap_org('<org id>')` (or `supabase/rollbacks/20261024000700_v2_legacy_bridge.down.sql`) deletes only what the bridge derived. It never writes a legacy
table, so every legacy response, including any accepted after the first sync, stays exactly as the legacy app stored it, and native v2 Campaigns are untouched. Re-applying
the bridge rebuilds the same archive.

## 6. What the bridge deliberately does not do
Activate anything; use a quota slot; count toward the participation gate; invent anonymity, audience, schedule or revision settings; publish results for old sessions;
copy points into any balance; copy free-text feedback, dish ratings or session join records (they stay in the legacy tables); fix ambiguous data; delete or hide anything.
Cutover of live sessions, student login and the legacy RPCs is a separate, later decision.
