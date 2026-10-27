-- Rollback for 000020: restore the 000008 day-coarsening trigger function. Timestamps already normalised stay as written.
create or replace function lv.coarsen_submission_time() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from lv.campaigns c where c.id = new.campaign_id and c.anonymity = 'anonymous') then
    new.created_at := date_trunc('day', new.created_at);
  end if;
  return new;
end;
$$;
