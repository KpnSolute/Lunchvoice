alter table public.survey_questions
  drop constraint if exists survey_questions_type_check;

alter table public.survey_questions
  add constraint survey_questions_type_check
  check (type = any (array['rating', 'text', 'single_choice', 'multi_choice', 'yes_no', 'flame', 'slider']));
