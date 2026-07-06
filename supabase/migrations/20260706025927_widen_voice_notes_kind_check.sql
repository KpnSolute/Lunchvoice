alter table public.voice_notes
  drop constraint if exists voice_notes_kind_check;

alter table public.voice_notes
  add constraint voice_notes_kind_check
  check (kind = any (array['review', 'idea', 'shoutout', 'announcement', 'bonus', 'special', 'event', 'result']));
