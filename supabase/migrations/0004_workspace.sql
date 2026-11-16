-- Employer pipeline view: masked exactly like search results (names appear only with consent or an accepted enquiry).
create or replace function public.pipeline_candidates()
returns table (candidate_id uuid, display_name text, current_designation text, city text, total_exp_years numeric,
  availability public.availability_window, still_listed boolean, stage public.pipeline_stage, notes text,
  updated_at timestamptz, enquiry_status public.enquiry_status)
language sql stable security definer set search_path = public as $$
  select c.user_id,
    case when c.show_full_name or exists (select 1 from enquiries e where e.candidate_id = c.user_id and e.employer_id = pe.employer_id and e.status = 'accepted')
      then pr.full_name else 'Candidate ' || c.public_code end,
    c.current_designation, c.city, c.total_exp_years, c.availability, c.listed, pe.stage, pe.notes, pe.updated_at,
    (select e.status from enquiries e where e.candidate_id = c.user_id and e.employer_id = pe.employer_id order by e.created_at desc limit 1)
  from pipeline_entries pe
  join candidates c on c.user_id = pe.candidate_id
  join profiles pr on pr.id = c.user_id
  where pe.employer_id = public.my_employer_id() and pr.status = 'active'
  order by pe.updated_at desc $$;
revoke all on function public.pipeline_candidates() from public, anon;
grant execute on function public.pipeline_candidates() to authenticated, service_role;
