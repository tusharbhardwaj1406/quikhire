-- Functions, triggers, row-level security and grants.
-- Principle: employers never read candidate tables directly. They go through
-- SECURITY DEFINER functions that check verification + subscription and apply
-- each candidate's consent settings before returning anything.

-- ───────────────────────── helpers ─────────────────────────
create or replace function public.setting(p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select value from platform_settings where key = p_key $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and status = 'active') $$;

create or replace function public.my_employer_id() returns uuid
language sql stable security definer set search_path = public as $$
  select employer_id from employer_members where user_id = auth.uid() $$;

create or replace function public.candidate_has_access(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from subscriptions where owner_user_id = p_user and access_until > now()) $$;

create or replace function public.employer_has_access(p_employer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from subscriptions where employer_id = p_employer and access_until > now()) $$;

create or replace function public.employer_can_search() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from employer_members m
    join employers e on e.id = m.employer_id
    join profiles p on p.id = m.user_id
    where m.user_id = auth.uid() and p.status = 'active'
      and e.verification_status = 'verified' and public.employer_has_access(e.id)) $$;

-- ───────────────────────── derived candidate data ─────────────────────────
create or replace function public.recompute_candidate(p_user uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_skills text[]; v_skill_text text; v_spec_text text; v_spec_count int; v_exp_text text; v_exp_count int;
  v_cert_text text; v_resume_count int; v_industry text; v_status account_status; v_role user_role; v_name text;
begin
  select coalesce(array_agg(lower(s.name::text) order by s.name), '{}'), coalesce(string_agg(s.name::text, ' '), '')
    into v_skills, v_skill_text
    from candidate_skills cs join skills s on s.id = cs.skill_id where cs.candidate_id = p_user;
  select coalesce(string_agg(s.name, ' '), ''), count(*) into v_spec_text, v_spec_count
    from candidate_specialisations cs join specialisations s on s.id = cs.specialisation_id where cs.candidate_id = p_user;
  select coalesce(string_agg(e.designation || ' ' || e.employer_name || ' ' || coalesce(e.projects, ''), ' '), ''), count(*)
    into v_exp_text, v_exp_count from experiences e where e.candidate_id = p_user;
  select coalesce(string_agg(name, ' '), '') into v_cert_text from certifications where candidate_id = p_user;
  select count(*) into v_resume_count from resumes where candidate_id = p_user;
  select status, role, full_name into v_status, v_role, v_name from profiles where id = p_user;

  update candidates c set
    skills_cache = v_skills,
    search_tsv =
      setweight(to_tsvector('english', coalesce(c.current_designation, '') || ' ' || v_skill_text || ' ' || v_spec_text), 'A') ||
      setweight(to_tsvector('english', coalesce((select name from industries where id = c.industry_id), '') || ' ' || coalesce(c.summary, '') || ' ' || v_cert_text), 'B') ||
      setweight(to_tsvector('english', v_exp_text || ' ' || coalesce(c.highest_qualification, '') || ' ' || coalesce(c.university, '') || ' ' || coalesce(c.city, '')), 'C'),
    profile_completeness =
      (case when coalesce(c.current_designation, '') <> '' then 10 else 0 end) +
      (case when c.total_exp_years is not null then 5 else 0 end) +
      (case when c.industry_id is not null then 10 else 0 end) +
      (case when v_spec_count > 0 then 10 else 0 end) +
      (case when cardinality(v_skills) >= 3 then 15 when cardinality(v_skills) > 0 then 7 else 0 end) +
      (case when coalesce(c.city, '') <> '' then 5 else 0 end) +
      (case when char_length(coalesce(c.summary, '')) >= 80 then 10 else 0 end) +
      (case when v_exp_count > 0 then 15 else 0 end) +
      (case when coalesce(c.highest_qualification, '') <> '' then 5 else 0 end) +
      (case when v_resume_count > 0 then 10 else 0 end) +
      (case when c.availability is not null then 5 else 0 end),
    onboarding_complete =
      coalesce(v_name, '') <> '' and coalesce(c.current_designation, '') <> '' and c.total_exp_years is not null
      and c.industry_id is not null and coalesce(c.city, '') <> '' and c.availability is not null
      and (v_spec_count > 0 or cardinality(v_skills) > 0)
  where c.user_id = p_user;

  update candidates c set listed =
      c.onboarding_complete and c.visibility = 'visible' and c.availability_status = 'active'
      and c.availability <= (public.setting('max_joining_window') #>> '{}')::availability_window
      and v_status = 'active' and v_role = 'candidate'
      and (not (public.setting('require_candidate_subscription'))::boolean or public.launch_is_free() or public.candidate_has_access(c.user_id))
  where c.user_id = p_user;
end $$;

create or replace function public.tg_candidates_before() returns trigger
language plpgsql as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;   -- internal recompute: leave timestamps alone
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if current_user in ('authenticated', 'anon') then  -- direct client edits cannot set trust fields
      new.availability_verification := old.availability_verification;
      new.availability_status := old.availability_status;
      new.availability_confirmed_at := old.availability_confirmed_at;
    end if;
    if new.availability is distinct from old.availability or new.earliest_joining_date is distinct from old.earliest_joining_date then
      new.availability_confirmed_at := now();          -- stating availability is itself a confirmation
      new.availability_status := 'active';
    end if;
  elsif new.availability is not null then
    new.availability_confirmed_at := now();
  end if;
  return new;
end $$;
create trigger candidates_before before insert or update on public.candidates
  for each row execute function public.tg_candidates_before();

create or replace function public.tg_recompute_candidate() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if tg_table_name = 'candidates' then
    if pg_trigger_depth() > 1 then return null; end if;
    v_id := new.user_id;
  elsif tg_table_name = 'profiles' then v_id := new.id;
  elsif tg_table_name = 'subscriptions' then v_id := coalesce(new.owner_user_id, old.owner_user_id);
  elsif tg_op = 'DELETE' then v_id := old.candidate_id;
  else v_id := new.candidate_id;
  end if;
  if v_id is not null then perform public.recompute_candidate(v_id); end if;
  return null;
end $$;
create trigger candidates_recompute after insert or update on public.candidates for each row execute function public.tg_recompute_candidate();
create trigger cand_spec_recompute after insert or delete on public.candidate_specialisations for each row execute function public.tg_recompute_candidate();
create trigger cand_skill_recompute after insert or delete on public.candidate_skills for each row execute function public.tg_recompute_candidate();
create trigger experiences_recompute after insert or update or delete on public.experiences for each row execute function public.tg_recompute_candidate();
create trigger certifications_recompute after insert or update or delete on public.certifications for each row execute function public.tg_recompute_candidate();
create trigger resumes_recompute after insert or delete on public.resumes for each row execute function public.tg_recompute_candidate();
create trigger profiles_recompute after update of status, full_name, role on public.profiles for each row execute function public.tg_recompute_candidate();
create trigger subscriptions_recompute after insert or update or delete on public.subscriptions for each row execute function public.tg_recompute_candidate();

-- ───────────────────────── identity triggers ─────────────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_role user_role; m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  -- 'admin' can never be self-assigned through sign-up metadata.
  if m ->> 'role' in ('candidate', 'employer') then v_role := (m ->> 'role')::user_role; end if;
  insert into profiles (id, role, full_name, email, phone)
  values (new.id, v_role, coalesce(m ->> 'full_name', m ->> 'name', ''), new.email, nullif(m ->> 'phone', ''))
  on conflict (id) do nothing;
  if m ? 'terms_version' then
    insert into consents (user_id, purpose, version, granted)
    values (new.id, 'terms', m ->> 'terms_version', true), (new.id, 'privacy', m ->> 'terms_version', true);
  end if;
  if v_role = 'candidate' then
    insert into candidates (user_id) values (new.id) on conflict do nothing;
    begin  -- optional hints captured on the sign-up form; bad input must never block account creation
      update candidates set
        city = nullif(m ->> 'city', ''),
        region_id = (select id from regions where id = nullif(m ->> 'region_id', '')::int),
        industry_id = (select id from industries where id = nullif(m ->> 'industry_id', '')::int),
        total_exp_years = nullif(m ->> 'total_exp_years', '')::numeric,
        employment_status = nullif(m ->> 'employment_status', ''),
        availability = nullif(m ->> 'availability', '')::availability_window,
        earliest_joining_date = nullif(m ->> 'earliest_joining_date', '')::date
      where user_id = new.id;
      insert into candidate_specialisations (candidate_id, specialisation_id)
        select new.id, id from specialisations where id = nullif(m ->> 'specialisation_id', '')::int on conflict do nothing;
    exception when others then null;
    end;
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.set_my_role(p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_role not in ('candidate', 'employer') then raise exception 'invalid role'; end if;
  update profiles set role = p_role::user_role where id = auth.uid() and role is null;
  if not found then raise exception 'role already set'; end if;
  if p_role = 'candidate' then insert into candidates (user_id) values (auth.uid()) on conflict do nothing; end if;
end $$;

create or replace function public.tg_profiles_protect() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if current_user in ('authenticated', 'anon') then
    new.role := old.role; new.status := old.status; new.email := old.email; new.phone_verified := old.phone_verified;
  end if;
  return new;
end $$;
create trigger profiles_protect before update on public.profiles for each row execute function public.tg_profiles_protect();

create or replace function public.tg_employers_protect() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if current_user in ('authenticated', 'anon') then
    new.verification_status := old.verification_status; new.verification_notes := old.verification_notes;
    new.verified_at := old.verified_at; new.verified_by := old.verified_by; new.created_by := old.created_by;
    -- changing legal identity after verification sends the company back for review
    if old.verification_status = 'verified' and (new.name is distinct from old.name
        or new.registration_number is distinct from old.registration_number) then
      new.verification_status := 'pending'; new.verified_at := null;
    end if;
  end if;
  return new;
end $$;
create trigger employers_protect before update on public.employers for each row execute function public.tg_employers_protect();

create or replace function public.request_account_deletion() returns void
language sql security definer set search_path = public as $$
  update profiles set status = 'deletion_requested' where id = auth.uid() and status = 'active';
  insert into audit_log (actor_id, action, target_type, target_id) values (auth.uid(), 'account.deletion_requested', 'profile', auth.uid()::text);
$$;

-- ───────────────────────── availability ─────────────────────────
create or replace function public.reconfirm_availability() returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_ts timestamptz := now();
begin
  update candidates set availability_confirmed_at = v_ts, availability_status = 'active'
   where user_id = auth.uid() and availability is not null;
  if not found then raise exception 'Set your availability first'; end if;
  return v_ts;
end $$;

-- Scheduled (daily). Marks stale availability as pending and drops lapsed subscriptions from the directory.
create or replace function public.run_maintenance() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; v_stale int := 0; v_lapsed int := 0;
  v_days int := (public.setting('availability_reconfirm_days'))::int;
begin
  for r in select user_id from candidates
            where availability_status = 'active' and availability_confirmed_at < now() - make_interval(days => v_days) loop
    update candidates set availability_status = 'confirmation_pending' where user_id = r.user_id;
    insert into notifications (user_id, type, title, body, link) values (r.user_id, 'availability.pending',
      'Please confirm you are still available',
      'Your profile is hidden from employer search until you confirm your availability. It takes one click.', '/candidate');
    v_stale := v_stale + 1;
  end loop;
  for r in select user_id from candidates c where c.listed and (public.setting('require_candidate_subscription'))::boolean
            and not public.launch_is_free() and not public.candidate_has_access(c.user_id) loop
    perform public.recompute_candidate(r.user_id);
    v_lapsed := v_lapsed + 1;
  end loop;
  update subscriptions set status = 'expired' where status in ('active', 'pending', 'cancelled', 'halted') and access_until < now() - interval '1 day';
  return jsonb_build_object('availability_marked_pending', v_stale, 'listings_lapsed', v_lapsed);
end $$;

create or replace function public.refresh_all_listings() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select user_id from candidates loop perform public.recompute_candidate(r.user_id); n := n + 1; end loop;
  return n;
end $$;

-- ───────────────────────── employer-facing read API ─────────────────────────
create or replace function public.search_candidates(p jsonb default '{}'::jsonb, p_limit int default 20, p_offset int default 0)
returns table (
  candidate_id uuid, public_code text, display_name text, current_designation text, industry text,
  specialisations text[], total_exp_years numeric, relevant_exp_years numeric, city text, state text,
  expected_ctc numeric, currency text, availability public.availability_window, earliest_joining_date date,
  availability_confirmed_at timestamptz, availability_verification public.availability_verification,
  top_skills text[], resume_updated_at timestamptz, profile_completeness int, updated_at timestamptz,
  work_modes text[], employment_types text[], pipeline_stage public.pipeline_stage, total_count bigint)
language plpgsql stable security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare
  v_emp uuid := public.my_employer_id();
  v_q tsquery; v_sort text := coalesce(p ->> 'sort', 'relevance');
  v_skills text[]; v_specs int[]; v_avail availability_window[]; v_modes text[]; v_types text[];
begin
  if not (public.employer_can_search() or public.is_admin()) then
    raise exception 'A verified employer account with an active subscription is required' using errcode = '42501';
  end if;
  if nullif(trim(p ->> 'q'), '') is not null then v_q := websearch_to_tsquery('english', p ->> 'q'); end if;
  if jsonb_typeof(p -> 'skills') = 'array' and jsonb_array_length(p -> 'skills') > 0 then
    select array_agg(lower(trim(x))) into v_skills from jsonb_array_elements_text(p -> 'skills') x; end if;
  if jsonb_typeof(p -> 'specialisation_ids') = 'array' and jsonb_array_length(p -> 'specialisation_ids') > 0 then
    select array_agg(x::int) into v_specs from jsonb_array_elements_text(p -> 'specialisation_ids') x; end if;
  if jsonb_typeof(p -> 'availability') = 'array' and jsonb_array_length(p -> 'availability') > 0 then
    select array_agg(x::availability_window) into v_avail from jsonb_array_elements_text(p -> 'availability') x; end if;
  if jsonb_typeof(p -> 'work_modes') = 'array' and jsonb_array_length(p -> 'work_modes') > 0 then
    select array_agg(x) into v_modes from jsonb_array_elements_text(p -> 'work_modes') x; end if;
  if jsonb_typeof(p -> 'employment_types') = 'array' and jsonb_array_length(p -> 'employment_types') > 0 then
    select array_agg(x) into v_types from jsonb_array_elements_text(p -> 'employment_types') x; end if;

  return query
  select c.user_id, c.public_code,
    case when c.show_full_name then pr.full_name else 'Candidate ' || c.public_code end,
    c.current_designation, i.name,
    (select array_agg(s.name order by s.name) from candidate_specialisations cs
       join specialisations s on s.id = cs.specialisation_id where cs.candidate_id = c.user_id),
    c.total_exp_years, c.relevant_exp_years, c.city, c.state,
    case when c.show_salary then c.expected_ctc end, c.currency,
    c.availability, c.earliest_joining_date, c.availability_confirmed_at, c.availability_verification,
    (select array_agg(t.name) from (select s.name::text as name from candidate_skills k join skills s on s.id = k.skill_id
       where k.candidate_id = c.user_id order by (lower(s.name::text) = any (coalesce(v_skills, '{}'))) desc, s.name limit 5) t),
    (select max(r.created_at) from resumes r where r.candidate_id = c.user_id),
    c.profile_completeness, c.updated_at, c.work_modes, c.employment_types,
    (select pe.stage from pipeline_entries pe where pe.employer_id = v_emp and pe.candidate_id = c.user_id),
    count(*) over ()
  from candidates c
  join profiles pr on pr.id = c.user_id
  left join industries i on i.id = c.industry_id
  where c.listed
    and (v_q is null or c.search_tsv @@ v_q)
    and (p ->> 'industry_id' is null or c.industry_id = (p ->> 'industry_id')::int)
    and (p ->> 'domain_id' is null or c.domain_id = (p ->> 'domain_id')::int)
    and (v_specs is null or (
          case when p ->> 'specialisations_mode' = 'all'
            then (select count(*) from candidate_specialisations cs where cs.candidate_id = c.user_id and cs.specialisation_id = any (v_specs)) = cardinality(v_specs)
            else exists (select 1 from candidate_specialisations cs where cs.candidate_id = c.user_id and cs.specialisation_id = any (v_specs)) end))
    and (v_skills is null or (case when p ->> 'skills_mode' = 'any' then c.skills_cache && v_skills else c.skills_cache @> v_skills end))
    and (p ->> 'exp_min' is null or c.total_exp_years >= (p ->> 'exp_min')::numeric)
    and (p ->> 'exp_max' is null or c.total_exp_years <= (p ->> 'exp_max')::numeric)
    and (p ->> 'relevant_exp_min' is null or c.relevant_exp_years >= (p ->> 'relevant_exp_min')::numeric)
    and (p ->> 'region' is null or c.region_id = (select rg.id from regions rg where rg.slug = p ->> 'region'))
    and (p ->> 'city' is null or c.city ilike '%' || (p ->> 'city') || '%')
    and (p ->> 'preferred_city' is null or exists (select 1 from unnest(c.preferred_locations) l where l ilike '%' || (p ->> 'preferred_city') || '%'))
    and (p ->> 'state' is null or c.state ilike (p ->> 'state'))
    and (p ->> 'country' is null or c.country ilike (p ->> 'country'))
    and (p ->> 'designation' is null or c.current_designation ilike '%' || (p ->> 'designation') || '%')
    and (p ->> 'qualification' is null or c.highest_qualification ilike '%' || (p ->> 'qualification') || '%' or c.university ilike '%' || (p ->> 'qualification') || '%')
    and (p ->> 'previous_employer' is null or (c.show_employment_history and exists (select 1 from experiences e
          where e.candidate_id = c.user_id and e.employer_name ilike '%' || (p ->> 'previous_employer') || '%')))
    and (p ->> 'certification' is null or exists (select 1 from certifications ce
          where ce.candidate_id = c.user_id and ce.name ilike '%' || (p ->> 'certification') || '%'))
    -- salary filters only ever match candidates who chose to share salary
    and (p ->> 'expected_ctc_max' is null or (c.show_salary and c.expected_ctc <= (p ->> 'expected_ctc_max')::numeric))
    and (p ->> 'expected_ctc_min' is null or (c.show_salary and c.expected_ctc >= (p ->> 'expected_ctc_min')::numeric))
    and (p ->> 'last_ctc_max' is null or (c.show_salary and c.last_ctc <= (p ->> 'last_ctc_max')::numeric))
    and (v_avail is null or c.availability = any (v_avail))
    and (p ->> 'join_by' is null or coalesce(c.earliest_joining_date, current_date) <= (p ->> 'join_by')::date)
    and (v_types is null or c.employment_types && v_types)
    and (v_modes is null or c.work_modes && v_modes)
    and (p ->> 'updated_within_days' is null or c.updated_at >= now() - make_interval(days => (p ->> 'updated_within_days')::int))
    and (p ->> 'verification' is null or c.availability_verification = (p ->> 'verification')::availability_verification)
  order by
    case when v_sort = 'experience' then c.total_exp_years end desc nulls last,
    case when v_sort = 'availability' then c.availability end asc nulls last,
    case when v_sort = 'updated' then c.updated_at end desc nulls last,
    case when v_sort = 'relevance' and v_q is not null then ts_rank(c.search_tsv, v_q) end desc nulls last,
    c.availability_confirmed_at desc nulls last, c.user_id
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
end $$;

create or replace function public.get_candidate_profile(p_candidate uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c candidates%rowtype; pr profiles%rowtype; v_emp uuid := public.my_employer_id();
  v_self boolean := (auth.uid() = p_candidate); v_admin boolean := public.is_admin();
  v_contact boolean; v_out jsonb; v_new boolean := false;
begin
  if not (v_self or v_admin or public.employer_can_search()) then
    raise exception 'A verified employer account with an active subscription is required' using errcode = '42501';
  end if;
  select * into c from candidates where user_id = p_candidate;
  if not found or not (c.listed or v_self or v_admin) then return null; end if;
  select * into pr from profiles where id = p_candidate;
  -- contact details are released by an explicit setting or by the candidate accepting this employer's enquiry
  v_contact := v_self or v_admin or exists (select 1 from enquiries e where e.candidate_id = p_candidate and e.employer_id = v_emp and e.status = 'accepted');

  v_out := jsonb_build_object(
    'candidate_id', c.user_id, 'public_code', c.public_code,
    'display_name', case when c.show_full_name or v_contact then pr.full_name else 'Candidate ' || c.public_code end,
    'name_hidden', not (c.show_full_name or v_contact),
    'current_designation', c.current_designation, 'summary', c.summary,
    'total_exp_years', c.total_exp_years, 'relevant_exp_years', c.relevant_exp_years,
    'industry', (select name from industries where id = c.industry_id),
    'domain', (select name from functional_domains where id = c.domain_id),
    'city', c.city, 'state', c.state, 'country', c.country, 'preferred_locations', c.preferred_locations,
    'highest_qualification', c.highest_qualification, 'university', c.university, 'graduation_year', c.graduation_year,
    'availability', c.availability, 'earliest_joining_date', c.earliest_joining_date,
    'availability_confirmed_at', c.availability_confirmed_at, 'availability_verification', c.availability_verification,
    'availability_status', c.availability_status,
    'employment_types', c.employment_types, 'work_modes', c.work_modes,
    'profile_completeness', c.profile_completeness, 'updated_at', c.updated_at,
    'allow_contact', c.allow_contact, 'allow_resume_download', c.allow_resume_download,
    'email', case when c.show_email or v_contact then pr.email::text end,
    'phone', case when c.show_phone or v_contact then pr.phone end,
    'linkedin_url', case when c.show_full_name or v_contact then c.linkedin_url end,
    'portfolio_url', case when c.show_full_name or v_contact then c.portfolio_url end,
    'salary', case when c.show_salary or v_self or v_admin then jsonb_build_object('last_ctc', c.last_ctc, 'expected_ctc', c.expected_ctc,
        'currency', c.currency, 'negotiable', c.ctc_negotiable) end,
    'specialisations', coalesce((select jsonb_agg(s.name order by s.name) from candidate_specialisations cs
        join specialisations s on s.id = cs.specialisation_id where cs.candidate_id = p_candidate), '[]'),
    'skills', coalesce((select jsonb_agg(jsonb_build_object('name', s.name, 'kind', k.kind) order by s.name) from candidate_skills k
        join skills s on s.id = k.skill_id where k.candidate_id = p_candidate), '[]'),
    'certifications', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'issuer', issuer, 'year', year)) from certifications where candidate_id = p_candidate), '[]'),
    'experiences', case when c.show_employment_history or v_self or v_admin then coalesce((select jsonb_agg(jsonb_build_object(
        'employer_name', employer_name, 'designation', designation, 'start_date', start_date, 'end_date', end_date,
        'responsibilities', responsibilities, 'projects', projects, 'achievements', achievements) order by start_date desc)
        from experiences where candidate_id = p_candidate), '[]') end,
    'resumes', case when c.allow_resume_download or v_self or v_admin then coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'label', coalesce(label, file_name), 'updated_at', created_at, 'is_primary', is_primary) order by is_primary desc, created_at desc)
        from resumes where candidate_id = p_candidate), '[]') end,
    'pipeline', (select jsonb_build_object('stage', stage, 'notes', notes) from pipeline_entries where employer_id = v_emp and candidate_id = p_candidate),
    'enquiry', (select jsonb_build_object('id', id, 'status', status, 'created_at', created_at) from enquiries
        where employer_id = v_emp and candidate_id = p_candidate order by created_at desc limit 1));

  if v_emp is not null and not v_self and not v_admin then
    insert into profile_views (candidate_id, employer_id, viewer_id) values (p_candidate, v_emp, auth.uid())
      on conflict (candidate_id, employer_id, viewed_on) do nothing returning true into v_new;
    if v_new then
      insert into notifications (user_id, type, title, body, link)
      select p_candidate, 'profile.viewed', 'An employer viewed your profile', e.name || ' (verified employer) viewed your profile.', '/candidate'
      from employers e where e.id = v_emp;
    end if;
  end if;
  return v_out;
end $$;

-- ───────────────────────── enquiries ─────────────────────────
create or replace function public.send_enquiry(p_candidate uuid, p_subject text, p_message text,
  p_kind text default 'enquiry', p_requirement uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.my_employer_id(); v_id uuid; v_name text;
begin
  if not public.employer_can_search() then
    raise exception 'A verified employer account with an active subscription is required' using errcode = '42501'; end if;
  if not exists (select 1 from candidates where user_id = p_candidate and listed and allow_contact) then
    raise exception 'This candidate is not accepting enquiries right now'; end if;
  if exists (select 1 from enquiries where employer_id = v_emp and candidate_id = p_candidate and status = 'sent') then
    raise exception 'You already have an enquiry awaiting this candidate''s reply'; end if;
  if (select count(*) from enquiries where employer_id = v_emp and created_at > now() - interval '1 day')
       >= (public.setting('enquiries_per_day'))::int then
    raise exception 'Daily enquiry limit reached. Please try again tomorrow'; end if;
  insert into enquiries (employer_id, sender_id, candidate_id, requirement_id, kind, subject, message)
    values (v_emp, auth.uid(), p_candidate, p_requirement, p_kind, trim(p_subject), trim(p_message)) returning id into v_id;
  insert into pipeline_entries (employer_id, candidate_id, requirement_id, stage, updated_by)
    values (v_emp, p_candidate, p_requirement, 'contacted', auth.uid())
    on conflict (employer_id, candidate_id) do update set stage = 'contacted', updated_by = auth.uid(), updated_at = now()
      where pipeline_entries.stage in ('saved', 'shortlisted');
  select name into v_name from employers where id = v_emp;
  insert into notifications (user_id, type, title, body, link) values (p_candidate, 'enquiry.received',
    case when p_kind = 'interview_request' then 'Interview request from ' else 'New enquiry from ' end || v_name,
    trim(p_subject), '/candidate/enquiries');
  return v_id;
end $$;

create or replace function public.respond_enquiry(p_enquiry uuid, p_accept boolean, p_response text default null) returns void
language plpgsql security definer set search_path = public as $$
declare e enquiries%rowtype;
begin
  update enquiries set status = case when p_accept then 'accepted' else 'declined' end::enquiry_status,
         response = nullif(trim(coalesce(p_response, '')), ''), responded_at = now()
   where id = p_enquiry and candidate_id = auth.uid() and status = 'sent' returning * into e;
  if not found then raise exception 'Enquiry not found or already answered'; end if;
  insert into notifications (user_id, type, title, body, link) values (e.sender_id, 'enquiry.answered',
    case when p_accept then 'A candidate accepted your enquiry' else 'A candidate declined your enquiry' end,
    e.subject, '/employer/candidates/' || e.candidate_id);
end $$;

-- Resume access: owner always; employers only with the candidate's download consent. Every download is logged.
create or replace function public.authorize_resume_download(p_resume uuid) returns text
language plpgsql security definer set search_path = public as $$
declare r resumes%rowtype; v_emp uuid := public.my_employer_id();
begin
  select * into r from resumes where id = p_resume;
  if not found then return null; end if;
  if r.candidate_id = auth.uid() or public.is_admin() then return r.storage_path; end if;
  if not public.employer_can_search() or not exists (select 1 from candidates
       where user_id = r.candidate_id and listed and allow_resume_download) then
    return null;
  end if;
  insert into resume_downloads (resume_id, candidate_id, employer_id, viewer_id) values (r.id, r.candidate_id, v_emp, auth.uid());
  insert into notifications (user_id, type, title, body, link)
    select r.candidate_id, 'resume.downloaded', 'Your resume was downloaded', e.name || ' (verified employer) downloaded your resume.', '/candidate'
    from employers e where e.id = v_emp;
  return r.storage_path;
end $$;

-- ───────────────────────── public + admin aggregates (no personal data) ─────────────────────────
create or replace function public.public_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'listed_candidates', (select count(*) from candidates where listed),
    'verified_employers', (select count(*) from employers where verification_status = 'verified'),
    'industries', (select count(*) from industries where is_active),
    'by_industry', coalesce((select jsonb_object_agg(slug, n) from (
        select i.slug, count(c.user_id) n from industries i left join candidates c on c.industry_id = i.id and c.listed
        where i.is_active group by i.slug) t), '{}')) $$;

create or replace function public.admin_metrics() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return jsonb_build_object(
    'candidates_total', (select count(*) from candidates),
    'candidates_listed', (select count(*) from candidates where listed),
    'candidates_pending_confirmation', (select count(*) from candidates where availability_status = 'confirmation_pending'),
    'candidates_verified_availability', (select count(*) from candidates where listed and availability_verification = 'verified'),
    'employers_total', (select count(*) from employers),
    'employers_pending', (select count(*) from employers where verification_status = 'pending'),
    'employers_verified', (select count(*) from employers where verification_status = 'verified'),
    'active_candidate_subs', (select count(*) from subscriptions where owner_user_id is not null and access_until > now()),
    'active_employer_subs', (select count(*) from subscriptions where employer_id is not null and access_until > now()),
    'mrr_paise', (select coalesce(sum(p.amount_paise), 0) from subscriptions s join plans p on p.id = s.plan_id
                   where s.status = 'active' and s.access_until > now() and not s.cancel_at_period_end),
    'cancelled_30d', (select count(*) from subscriptions where cancelled_at > now() - interval '30 days'),
    'revenue_30d_paise', (select coalesce(sum(amount_paise - refunded_paise), 0) from payments where status in ('captured', 'refunded') and paid_at > now() - interval '30 days'),
    'failed_payments_30d', (select count(*) from payments where status = 'failed' and created_at > now() - interval '30 days'),
    'enquiries_30d', (select count(*) from enquiries where created_at > now() - interval '30 days'),
    'enquiries_accepted_30d', (select count(*) from enquiries where status = 'accepted' and responded_at > now() - interval '30 days'),
    'hires_reported', (select count(*) from pipeline_entries where stage = 'hired'),
    'open_reports', (select count(*) from reports where status = 'open'),
    'by_industry', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'total', total, 'listed', listed) order by total desc) from (
        select i.name, count(c.user_id) total, count(c.user_id) filter (where c.listed) listed
        from industries i left join candidates c on c.industry_id = i.id group by i.name) t), '[]'),
    'by_city', coalesce((select jsonb_agg(jsonb_build_object('city', city, 'total', total) order by total desc) from (
        select initcap(trim(city)) city, count(*) total from candidates where coalesce(city, '') <> '' group by 1 order by 2 desc limit 15) t), '[]'));
end $$;

-- ───────────────────────── row-level security ─────────────────────────
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- identity
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- taxonomy + plans are public reference data
create policy industries_read on public.industries for select to anon, authenticated using (is_active or public.is_admin());
create policy domains_read on public.functional_domains for select to anon, authenticated using (is_active or public.is_admin());
create policy specialisations_read on public.specialisations for select to anon, authenticated using (is_active or public.is_admin());
create policy skills_read on public.skills for select to anon, authenticated using (is_active or public.is_admin());
create policy skills_insert on public.skills for insert to authenticated with check (created_by = auth.uid() and is_active);
create policy plans_read on public.plans for select to anon, authenticated using (is_active or public.is_admin());

-- candidate-owned data: the owner (and admins, read-only) — never employers
create policy candidates_select on public.candidates for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy candidates_update on public.candidates for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cand_spec_all on public.candidate_specialisations for all to authenticated using (candidate_id = auth.uid()) with check (candidate_id = auth.uid());
create policy cand_skill_all on public.candidate_skills for all to authenticated using (candidate_id = auth.uid()) with check (candidate_id = auth.uid());
create policy experiences_all on public.experiences for all to authenticated using (candidate_id = auth.uid()) with check (candidate_id = auth.uid());
create policy certifications_all on public.certifications for all to authenticated using (candidate_id = auth.uid()) with check (candidate_id = auth.uid());
create policy resumes_all on public.resumes for all to authenticated using (candidate_id = auth.uid()) with check (candidate_id = auth.uid());
create policy cand_spec_admin on public.candidate_specialisations for select to authenticated using (public.is_admin());
create policy cand_skill_admin on public.candidate_skills for select to authenticated using (public.is_admin());
create policy experiences_admin on public.experiences for select to authenticated using (public.is_admin());
create policy resumes_admin on public.resumes for select to authenticated using (public.is_admin());

-- employers
create policy employers_select on public.employers for select to authenticated using (id = public.my_employer_id() or created_by = auth.uid() or public.is_admin());
create policy employers_insert on public.employers for insert to authenticated with check (created_by = auth.uid() and verification_status = 'pending' and verified_at is null);
create policy employers_update on public.employers for update to authenticated using (id = public.my_employer_id()) with check (id = public.my_employer_id());
create policy members_select on public.employer_members for select to authenticated using (user_id = auth.uid() or employer_id = public.my_employer_id() or public.is_admin());
create policy members_insert on public.employer_members for insert to authenticated with check (
  user_id = auth.uid() and exists (select 1 from public.employers e where e.id = employer_id and e.created_by = auth.uid()));

-- billing: read-only to the owner; all writes happen server-side from verified gateway events
create policy subscriptions_select on public.subscriptions for select to authenticated using (owner_user_id = auth.uid() or employer_id = public.my_employer_id() or public.is_admin());
create policy payments_select on public.payments for select to authenticated using (public.is_admin() or exists (
  select 1 from public.subscriptions s where s.id = subscription_id and (s.owner_user_id = auth.uid() or s.employer_id = public.my_employer_id())));

-- hiring workspace: members of the employer; writes need a verified + subscribed employer
create policy requirements_select on public.requirements for select to authenticated using (employer_id = public.my_employer_id() or public.is_admin());
create policy requirements_write on public.requirements for all to authenticated using (employer_id = public.my_employer_id() and public.employer_can_search()) with check (employer_id = public.my_employer_id() and public.employer_can_search());
create policy pipeline_select on public.pipeline_entries for select to authenticated using (employer_id = public.my_employer_id());
create policy pipeline_write on public.pipeline_entries for all to authenticated using (employer_id = public.my_employer_id() and public.employer_can_search()) with check (employer_id = public.my_employer_id() and public.employer_can_search());
create policy saved_searches_all on public.saved_searches for all to authenticated using (employer_id = public.my_employer_id() and user_id = auth.uid()) with check (employer_id = public.my_employer_id() and user_id = auth.uid() and public.employer_can_search());

-- enquiries + activity: readable by both sides; created/answered only through functions
create policy enquiries_select on public.enquiries for select to authenticated using (candidate_id = auth.uid() or employer_id = public.my_employer_id() or public.is_admin());
create policy profile_views_select on public.profile_views for select to authenticated using (candidate_id = auth.uid());
create policy resume_downloads_select on public.resume_downloads for select to authenticated using (candidate_id = auth.uid());

-- platform
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy consents_select on public.consents for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy consents_insert on public.consents for insert to authenticated with check (user_id = auth.uid());
create policy reports_insert on public.reports for insert to authenticated with check (reporter_id = auth.uid() and status = 'open');
create policy reports_select on public.reports for select to authenticated using (reporter_id = auth.uid() or public.is_admin());
create policy audit_select on public.audit_log for select to authenticated using (public.is_admin());
create policy settings_select on public.platform_settings for select to authenticated using (public.is_admin());
create policy webhooks_select on public.webhook_events for select to authenticated using (public.is_admin());

-- ───────────────────────── grants (explicit; nothing relies on defaults) ─────────────────────────
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
grant select on public.industries, public.functional_domains, public.specialisations, public.skills, public.plans to anon, authenticated;
grant select on all tables in schema public to authenticated;
grant insert on public.skills, public.employers, public.employer_members, public.consents, public.reports to authenticated;
grant update on public.profiles, public.candidates, public.employers, public.notifications to authenticated;
grant insert, update, delete on public.candidate_specialisations, public.candidate_skills, public.experiences, public.certifications,
  public.resumes, public.requirements, public.pipeline_entries, public.saved_searches to authenticated;
grant usage on all sequences in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
grant execute on function public.public_stats(), public.is_admin() to anon, authenticated;
grant execute on function public.is_admin(), public.my_employer_id(), public.employer_can_search(), public.candidate_has_access(uuid),
  public.employer_has_access(uuid), public.set_my_role(text), public.request_account_deletion(), public.reconfirm_availability(),
  public.search_candidates(jsonb, int, int), public.get_candidate_profile(uuid), public.send_enquiry(uuid, text, text, text, uuid),
  public.respond_enquiry(uuid, boolean, text), public.admin_metrics(), public.authorize_resume_download(uuid) to authenticated;

-- private resume bucket (Supabase only; access is exclusively via short-lived signed URLs issued by the server)
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('resumes', 'resumes', false, 5242880, array['application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
    on conflict (id) do nothing;
  end if;
end $$;
