-- Rollback for 000040_v2_display_name_never_email. Restores the 000001/000015 bodies and drops the check and helper.
-- Rewritten display names stay rewritten: a rollback never puts an email address back.
begin;
alter table lv.accounts drop constraint if exists accounts_display_name_no_email;

create or replace function lv.ensure_account() returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_ci jsonb := lv.caller_identity();
  v_acc uuid;
  v_name text;
begin
  if v_ci is null then return null; end if;

  select i.account_id into v_acc
    from lv.account_identities i
   where i.identity_issuer = v_ci->>'issuer' and i.identity_subject = v_ci->>'subject';
  if v_acc is not null then
    update lv.account_identities i
       set email = coalesce(v_ci->>'email', i.email),
           display_name = coalesce(v_ci->>'name', i.display_name),
           picture_url = coalesce(v_ci->>'picture', i.picture_url),
           email_verified_at = case when (v_ci->>'email_verified')::boolean
                                    then coalesce(i.email_verified_at, now()) else i.email_verified_at end,
           updated_at = now()
     where i.identity_issuer = v_ci->>'issuer' and i.identity_subject = v_ci->>'subject';
    return v_acc;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('lv_account:' || (v_ci->>'issuer') || '|' || (v_ci->>'subject'), 0));

  select i.account_id into v_acc
    from lv.account_identities i
   where i.identity_issuer = v_ci->>'issuer' and i.identity_subject = v_ci->>'subject';
  if v_acc is not null then return v_acc; end if;

  v_name := coalesce(nullif(btrim(v_ci->>'name'), ''),
                     nullif(btrim(split_part(coalesce(v_ci->>'email', ''), '@', 1)), ''),
                     'Member');

  insert into lv.accounts (display_name) values (left(v_name, 80)) returning id into v_acc;
  insert into lv.account_identities
    (account_id, identity_issuer, identity_subject, email, email_verified_at, display_name, picture_url)
  values
    (v_acc, v_ci->>'issuer', v_ci->>'subject', v_ci->>'email',
     case when (v_ci->>'email_verified')::boolean then now() end,
     nullif(btrim(v_ci->>'name'), ''), v_ci->>'picture');

  perform lv.audit(v_acc, null, 'account.created', v_acc::text,
                   jsonb_build_object('issuer', v_ci->>'issuer'));
  return v_acc;
end;
$$;

create or replace function lv.api_profile_update(p_display_name text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_name text := btrim(p_display_name);
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  if v_name is null or v_name = '' or length(v_name) > 80 then return lv.err('lv_invalid_input', 'A display name is 1 to 80 characters.'); end if;
  update lv.accounts set display_name = v_name where id = v_account;
  return jsonb_build_object('ok', true, 'account', jsonb_build_object('account_id', v_account, 'display_name', v_name));
end;
$$;

drop function if exists lv.safe_display_name(text, text);
commit;
