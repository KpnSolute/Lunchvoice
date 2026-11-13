-- 000040: a display name is never an email address (pre-launch audit P3, founder decision 2026-11-12).
--
-- Before: ensure_account used the token's `name` claim as the display name, and KpnIdentity sends the email address
-- as `name` for email/password sign-ups, so member lists showed emails next to "Emails are never shown". The
-- profile editor also accepted any text.
--
-- Now:
--   * lv.safe_display_name(name, email): the name when it has no "@"; otherwise the part before the @ (of the name,
--     else of the email) with leading and trailing digits trimmed; "Member" when that leaves nothing.
--   * ensure_account creates accounts through it, and never caches an "@" name in account_identities.display_name.
--   * lv_profile_update refuses a name containing "@" (lv_invalid_input).
--   * lv.accounts gets CHECK (display_name has no "@"). It is added NOT VALID so this migration applies to a database
--     that still holds the old rows; scripts/data-fixes/2026-11-12_p3_display_names.sql rewrites them and validates
--     the constraint. New and updated rows are checked from this migration on.
-- Rollback: supabase/rollbacks/000040_v2_display_name_never_email.down.sql.
begin;

create function lv.safe_display_name(p_name text, p_email text) returns text
language plpgsql immutable set search_path = ''
as $$
declare
  v_name text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '[[:space:]]+', ' ', 'g')), '');
  v_local text;
begin
  if v_name is not null and position('@' in v_name) = 0 then
    return left(v_name, 80);
  end if;
  v_local := split_part(coalesce(case when v_name is not null then v_name end, p_email, ''), '@', 1);
  if v_local = '' and p_email is not null then v_local := split_part(p_email, '@', 1); end if;
  v_local := btrim(btrim(v_local), '0123456789');
  v_local := nullif(btrim(v_local), '');
  return left(coalesce(v_local, 'Member'), 80);
end;
$$;

comment on function lv.safe_display_name(text, text) is
  'Display name from token claims that is never an email: the name without "@", else the local part with digits trimmed, else Member.';

create or replace function lv.ensure_account() returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_ci jsonb := lv.caller_identity();
  v_acc uuid;
  v_name text;
  v_claim_name text;
begin
  if v_ci is null then return null; end if;
  -- The cached token name is kept only when it is not an email address.
  v_claim_name := nullif(btrim(v_ci->>'name'), '');
  if position('@' in coalesce(v_claim_name, '')) > 0 then v_claim_name := null; end if;

  select i.account_id into v_acc
    from lv.account_identities i
   where i.identity_issuer = v_ci->>'issuer' and i.identity_subject = v_ci->>'subject';
  if v_acc is not null then
    -- Refresh cached attributes. This never changes who the person is.
    update lv.account_identities i
       set email = coalesce(v_ci->>'email', i.email),
           display_name = coalesce(v_claim_name, i.display_name),
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

  v_name := lv.safe_display_name(v_ci->>'name', v_ci->>'email');

  insert into lv.accounts (display_name) values (v_name) returning id into v_acc;
  insert into lv.account_identities
    (account_id, identity_issuer, identity_subject, email, email_verified_at, display_name, picture_url)
  values
    (v_acc, v_ci->>'issuer', v_ci->>'subject', v_ci->>'email',
     case when (v_ci->>'email_verified')::boolean then now() end,
     v_claim_name, v_ci->>'picture');

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
  if position('@' in v_name) > 0 then
    return lv.err('lv_invalid_input', 'A display name can’t contain @, so it never shows an email address.');
  end if;
  update lv.accounts set display_name = v_name where id = v_account;
  return jsonb_build_object('ok', true, 'account', jsonb_build_object('account_id', v_account, 'display_name', v_name));
end;
$$;

-- Internal helper: callable only by the definer functions above (the catalogue tests enforce this).
revoke all on function lv.safe_display_name(text, text) from public;

alter table lv.accounts
  add constraint accounts_display_name_no_email check (position('@' in display_name) = 0) not valid;

commit;
