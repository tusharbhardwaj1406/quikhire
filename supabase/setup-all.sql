-- QuikHire: complete database setup for a NEW, EMPTY Supabase project.
-- Generated from supabase/migrations/0001-0005. Run once, as a whole, in the Supabase SQL editor.

-- ===================== supabase/migrations/0001_schema.sql =====================
-- QuikHire core schema. PostgreSQL 15+ / Supabase.
-- Money is stored in paise (integer) for payments and in whole currency units for CTC.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists citext with schema extensions;

-- ───────────────────────── enums ─────────────────────────
create type public.user_role as enum ('candidate', 'employer', 'admin');
create type public.account_status as enum ('active', 'suspended', 'deletion_requested');
create type public.availability_window as enum ('immediate', 'within_7_days', 'within_15_days', 'within_30_days');
create type public.availability_status as enum ('active', 'confirmation_pending');
create type public.availability_verification as enum ('self_declared', 'verified');
create type public.profile_visibility as enum ('visible', 'paused');
create type public.employer_kind as enum ('employer', 'agency');
create type public.verification_status as enum ('pending', 'verified', 'rejected', 'suspended');
create type public.subscription_status as enum ('created', 'authenticated', 'active', 'pending', 'halted', 'cancelled', 'completed', 'expired');
create type public.pipeline_stage as enum ('saved', 'shortlisted', 'contacted', 'interview', 'rejected', 'hired');
create type public.enquiry_status as enum ('sent', 'accepted', 'declined', 'withdrawn');

-- ───────────────────────── identity ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role,                       -- null until chosen (OAuth sign-ups)
  full_name text not null default '',
  email extensions.citext,
  phone text,
  phone_verified boolean not null default false,
  status public.account_status not null default 'active',
  notify_email boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role);

-- ───────────────────────── taxonomy: Industry → Functional Domain → Specialisation → Skills ─────────────────────────
create table public.industries (
  id serial primary key,
  slug text not null unique,
  name text not null unique,
  sort_order int not null default 0,
  is_active boolean not null default true
);
create table public.functional_domains (
  id serial primary key,
  industry_id int not null references public.industries (id) on delete cascade,
  slug text not null,
  name text not null,
  is_active boolean not null default true,
  unique (industry_id, slug)
);
create table public.specialisations (
  id serial primary key,
  industry_id int not null references public.industries (id) on delete cascade,
  domain_id int references public.functional_domains (id) on delete set null,
  slug text not null,
  name text not null,
  is_active boolean not null default true,
  unique (industry_id, slug)
);
create table public.skills (
  id serial primary key,
  name extensions.citext not null unique,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null
);
create index skills_name_trgm on public.skills using gin ((name::text) extensions.gin_trgm_ops);
create index specialisations_name_trgm on public.specialisations using gin (name extensions.gin_trgm_ops);

-- ───────────────────────── candidates ─────────────────────────
create table public.candidates (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  public_code text generated always as ('QH-' || upper(substr(md5(user_id::text), 1, 7))) stored,
  current_designation text,
  summary text,
  total_exp_years numeric(4, 1) check (total_exp_years between 0 and 60),
  relevant_exp_years numeric(4, 1) check (relevant_exp_years between 0 and 60),
  industry_id int references public.industries (id) on delete set null,
  domain_id int references public.functional_domains (id) on delete set null,
  city text, state text, country text not null default 'India',
  preferred_locations text[] not null default '{}',
  linkedin_url text, portfolio_url text, website_url text, photo_path text,
  highest_qualification text, university text, graduation_year int check (graduation_year between 1950 and 2100),
  -- availability (the core of the product)
  employment_status text,                      -- free text chosen from a UI list; never auto-labelled
  currently_employed boolean not null default false,
  serving_notice boolean not null default false,
  last_working_date date,
  availability public.availability_window,
  earliest_joining_date date,
  availability_reason text,                    -- optional, never shown without consent
  availability_confirmed_at timestamptz,
  availability_status public.availability_status not null default 'active',
  availability_verification public.availability_verification not null default 'self_declared',
  employment_types text[] not null default '{}',   -- full_time | contract | freelance
  work_modes text[] not null default '{}',         -- remote | hybrid | onsite
  -- salary
  last_ctc numeric(14, 2), expected_ctc numeric(14, 2), min_ctc numeric(14, 2),
  currency text not null default 'INR', ctc_negotiable boolean not null default true,
  -- privacy / consent controls (all default to the most private option)
  visibility public.profile_visibility not null default 'visible',
  show_full_name boolean not null default false,
  show_email boolean not null default false,
  show_phone boolean not null default false,
  show_salary boolean not null default false,
  show_employment_history boolean not null default true,
  allow_resume_download boolean not null default false,
  allow_contact boolean not null default true,
  -- derived (maintained by recompute_candidate)
  onboarding_complete boolean not null default false,
  profile_completeness int not null default 0,
  skills_cache text[] not null default '{}',
  search_tsv tsvector,
  listed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index candidates_search_idx on public.candidates using gin (search_tsv) where listed;
create index candidates_listed_industry_idx on public.candidates (industry_id, availability) where listed;
create index candidates_listed_updated_idx on public.candidates (updated_at desc) where listed;
create index candidates_listed_exp_idx on public.candidates (total_exp_years) where listed;
create index candidates_city_trgm on public.candidates using gin (city extensions.gin_trgm_ops) where listed;
create index candidates_skills_idx on public.candidates using gin (skills_cache) where listed;
create index candidates_reconfirm_idx on public.candidates (availability_confirmed_at) where availability_status = 'active';

create table public.candidate_specialisations (
  candidate_id uuid not null references public.candidates (user_id) on delete cascade,
  specialisation_id int not null references public.specialisations (id) on delete cascade,
  primary key (candidate_id, specialisation_id)
);
create index candidate_specialisations_spec_idx on public.candidate_specialisations (specialisation_id);

create table public.candidate_skills (
  candidate_id uuid not null references public.candidates (user_id) on delete cascade,
  skill_id int not null references public.skills (id) on delete cascade,
  kind text not null default 'skill' check (kind in ('skill', 'software')),
  primary key (candidate_id, skill_id)
);
create index candidate_skills_skill_idx on public.candidate_skills (skill_id);

create table public.experiences (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates (user_id) on delete cascade,
  employer_name text not null,
  designation text not null,
  start_date date not null,
  end_date date,
  responsibilities text, projects text, achievements text,
  reason_for_leaving text,                     -- optional; never returned to employers
  check (end_date is null or end_date >= start_date)
);
create index experiences_candidate_idx on public.experiences (candidate_id, start_date desc);
create index experiences_employer_trgm on public.experiences using gin (employer_name extensions.gin_trgm_ops);

create table public.certifications (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates (user_id) on delete cascade,
  name text not null, issuer text, year int
);
create index certifications_candidate_idx on public.certifications (candidate_id);

create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates (user_id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 5242880),
  label text,
  is_primary boolean not null default false,
  parsed_text text,
  created_at timestamptz not null default now()
);
create unique index resumes_one_primary on public.resumes (candidate_id) where is_primary;

-- ───────────────────────── employers ─────────────────────────
create table public.employers (
  id uuid primary key default gen_random_uuid(),
  kind public.employer_kind not null default 'employer',
  name text not null,
  website text,
  industry_id int references public.industries (id) on delete set null,
  company_size text,
  city text, state text, country text not null default 'India',
  registration_type text check (registration_type in ('gstin', 'cin', 'llpin', 'udyam', 'other')),
  registration_number text,
  verification_status public.verification_status not null default 'pending',
  verification_notes text,
  verified_at timestamptz,
  verified_by uuid references public.profiles (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index employers_status_idx on public.employers (verification_status, created_at);

create table public.employer_members (
  user_id uuid primary key references public.profiles (id) on delete cascade,   -- one company per recruiter login (v1)
  employer_id uuid not null references public.employers (id) on delete cascade,
  designation text,
  is_owner boolean not null default false,
  created_at timestamptz not null default now()
);
create index employer_members_employer_idx on public.employer_members (employer_id);

-- ───────────────────────── billing ─────────────────────────
create table public.plans (
  id serial primary key,
  code text not null unique,                   -- candidate_monthly | employer_monthly
  audience public.user_role not null check (audience in ('candidate', 'employer')),
  name text not null,
  amount_paise int not null check (amount_paise > 0),
  currency text not null default 'INR',
  billing_interval text not null default 'month',
  gst_mode text not null default 'inclusive' check (gst_mode in ('inclusive', 'exclusive')),
  gst_rate numeric(5, 2) not null default 18.00,
  provider text,
  provider_plan_id text,                       -- must be re-created at the gateway when the price changes
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  plan_id int not null references public.plans (id),
  owner_user_id uuid references public.profiles (id) on delete cascade,   -- candidate plans
  employer_id uuid references public.employers (id) on delete cascade,    -- employer plans
  status public.subscription_status not null default 'created',
  provider text not null,
  provider_subscription_id text,
  provider_customer_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  access_until timestamptz,                    -- paid access ends here (period end + grace); set only from verified gateway events
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  autopay_consent_at timestamptz not null,     -- explicit recurring-payment consent captured before checkout
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id),
  check ((owner_user_id is null) <> (employer_id is null))
);
create index subscriptions_owner_idx on public.subscriptions (owner_user_id, status);
create index subscriptions_employer_idx on public.subscriptions (employer_id, status);

create sequence public.invoice_number_seq;
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  provider text not null,
  provider_payment_id text not null,
  amount_paise int not null,
  tax_paise int not null default 0,
  currency text not null default 'INR',
  status text not null,                        -- captured | failed | refunded
  method text,
  invoice_number text unique,
  paid_at timestamptz,
  refunded_paise int not null default 0,
  created_at timestamptz not null default now(),
  unique (provider, provider_payment_id)
);
create index payments_subscription_idx on public.payments (subscription_id, created_at desc);

create table public.webhook_events (
  id bigserial primary key,
  provider text not null,
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  unique (provider, event_id)
);

-- ───────────────────────── hiring workspace ─────────────────────────
create table public.requirements (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references public.employers (id) on delete cascade,
  title text not null,
  description text,
  filters jsonb not null default '{}',
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index requirements_employer_idx on public.requirements (employer_id, status);

create table public.pipeline_entries (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references public.employers (id) on delete cascade,
  candidate_id uuid not null references public.candidates (user_id) on delete cascade,
  requirement_id uuid references public.requirements (id) on delete set null,
  stage public.pipeline_stage not null default 'saved',
  notes text,                                  -- internal; never visible to candidates
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employer_id, candidate_id)
);
create index pipeline_employer_stage_idx on public.pipeline_entries (employer_id, stage);

create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references public.employers (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  filters jsonb not null,
  notify boolean not null default true,
  created_at timestamptz not null default now()
);
create index saved_searches_employer_idx on public.saved_searches (employer_id);

create table public.enquiries (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references public.employers (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  candidate_id uuid not null references public.candidates (user_id) on delete cascade,
  requirement_id uuid references public.requirements (id) on delete set null,
  kind text not null default 'enquiry' check (kind in ('enquiry', 'interview_request')),
  subject text not null check (char_length(subject) between 3 and 150),
  message text not null check (char_length(message) between 10 and 4000),
  status public.enquiry_status not null default 'sent',
  response text,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);
create index enquiries_candidate_idx on public.enquiries (candidate_id, created_at desc);
create index enquiries_employer_idx on public.enquiries (employer_id, created_at desc);

create table public.profile_views (
  id bigserial primary key,
  candidate_id uuid not null references public.candidates (user_id) on delete cascade,
  employer_id uuid not null references public.employers (id) on delete cascade,
  viewer_id uuid references public.profiles (id) on delete set null,
  viewed_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (candidate_id, employer_id, viewed_on)
);

create table public.resume_downloads (
  id bigserial primary key,
  resume_id uuid not null references public.resumes (id) on delete cascade,
  candidate_id uuid not null references public.candidates (user_id) on delete cascade,
  employer_id uuid not null references public.employers (id) on delete cascade,
  viewer_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index resume_downloads_candidate_idx on public.resume_downloads (candidate_id, created_at desc);

-- ───────────────────────── platform ─────────────────────────
create table public.notifications (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.consents (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  purpose text not null,                       -- terms | privacy | directory_listing | recurring_payment | marketing
  version text not null,
  granted boolean not null,
  created_at timestamptz not null default now()
);
create index consents_user_idx on public.consents (user_id, purpose, created_at desc);

create table public.reports (
  id bigserial primary key,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('employer', 'candidate', 'enquiry')),
  target_id uuid not null,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigserial primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (key, value) values
  ('max_joining_window', '"within_30_days"'),
  ('availability_reconfirm_days', '30'),
  ('require_candidate_subscription', 'true'),
  ('subscription_grace_days', '3'),
  ('enquiries_per_day', '40');

insert into public.plans (code, audience, name, amount_paise) values
  ('candidate_monthly', 'candidate', 'Candidate — Monthly', 14900),
  ('employer_monthly', 'employer', 'Employer / Recruiter — Monthly', 149900);

-- ===================== supabase/migrations/0002_functions_rls.sql =====================
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

-- ===================== supabase/migrations/0003_seed_taxonomy.sql =====================
-- Starter taxonomy: Industry → Functional Domain → Specialisation. Fully editable from the admin panel.
create or replace function pg_temp.slugify(t text) returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(t), '[^a-z0-9]+', '-', 'g')) $$;

create or replace function pg_temp.seed_tax(p_sort int, p_industry text, p_tree jsonb) returns void language plpgsql as $$
declare v_ind int; v_dom int; d record; s text;
begin
  insert into public.industries (slug, name, sort_order) values (pg_temp.slugify(p_industry), p_industry, p_sort) returning id into v_ind;
  for d in select key, value from jsonb_each(p_tree) loop
    insert into public.functional_domains (industry_id, slug, name) values (v_ind, pg_temp.slugify(d.key), d.key) returning id into v_dom;
    for s in select jsonb_array_elements_text(d.value) loop
      insert into public.specialisations (industry_id, domain_id, slug, name) values (v_ind, v_dom, pg_temp.slugify(s), s)
      on conflict (industry_id, slug) do nothing;
    end loop;
  end loop;
end $$;

select pg_temp.seed_tax(1, 'Civil Engineering and Infrastructure', '{
  "Design and Engineering": ["Bridge Engineering","Structural Engineering","Highway Engineering","Geotechnical Engineering","Tunnelling","Structural Analysis","Design Checking","Prestressed Concrete","Steel Structures","Cable-Stayed Bridges","BIM Management","Revit"],
  "Rail and Transit": ["Metro Rail","Railway Infrastructure"],
  "Construction and Site": ["Construction Management","Site Execution","QA/QC","Infrastructure Inspection"],
  "Project Controls and Commercial": ["Project Management","Planning and Scheduling","Quantity Surveying","Contract Management"]}');
select pg_temp.seed_tax(2, 'Mechanical Engineering', '{
  "Design": ["Product Design","CAD/CAE","HVAC Design","Piping Design","Tool and Die Design"],
  "Plant and Maintenance": ["Plant Maintenance","Rotating Equipment","Reliability Engineering","Utilities"],
  "Production": ["Production Engineering","Quality Engineering","Automotive Engineering"]}');
select pg_temp.seed_tax(3, 'Electrical Engineering', '{
  "Power": ["Power Systems","Substation Design","Transmission and Distribution","Renewable Energy","Solar PV"],
  "Industrial": ["Electrical Maintenance","Instrumentation and Control","PLC/SCADA","MEP Electrical"]}');
select pg_temp.seed_tax(4, 'Electronics and Telecommunications', '{
  "Electronics": ["Embedded Systems","VLSI Design","PCB Design","Semiconductor Verification"],
  "Telecom": ["RF Engineering","Network Planning","5G/LTE","Optical Fibre Networks","Telecom Operations"]}');
select pg_temp.seed_tax(5, 'Information Technology', '{
  "Infrastructure and Cloud": ["Cloud Computing","AWS","Azure","DevOps","System Administration","Network Engineering"],
  "Security": ["Cybersecurity","Security Operations","Identity and Access Management"],
  "Data Platforms": ["SQL","Database Administration","Data Engineering"],
  "Legacy Systems": ["Mainframe","COBOL"],
  "Service Delivery": ["IT Project Management","IT Support","ERP/SAP"]}');
select pg_temp.seed_tax(6, 'Software Development', '{
  "Backend": ["Java","Python",".NET","Node.js","Go","PHP"],
  "Frontend": ["React","Angular","Vue.js","UI Engineering"],
  "Mobile": ["Android","iOS","Flutter","React Native"],
  "Quality": ["Testing and Automation","Performance Testing","Manual Testing"],
  "Leadership": ["Engineering Management","Solution Architecture","Product Management"]}');
select pg_temp.seed_tax(7, 'Artificial Intelligence and Machine Learning', '{
  "Applied AI": ["Machine Learning Engineering","Deep Learning","Natural Language Processing","Computer Vision","Generative AI","MLOps"],
  "Research": ["AI Research","Recommendation Systems"]}');
select pg_temp.seed_tax(8, 'Data Science and Analytics', '{
  "Analytics": ["Business Intelligence","Data Analysis","Power BI","Tableau","Product Analytics"],
  "Data Science": ["Statistical Modelling","Forecasting","Data Science"],
  "Data Platforms": ["Data Warehousing","ETL Development","Big Data"]}');
select pg_temp.seed_tax(9, 'Banking and Financial Services', '{
  "Banking": ["Retail Banking","Corporate Banking","Credit Analysis","Collections","Branch Operations"],
  "Markets and Risk": ["Risk Management","Treasury","Wealth Management","Investment Banking"],
  "Insurance": ["Underwriting","Claims","Insurance Sales"]}');
select pg_temp.seed_tax(10, 'Accounting and Finance', '{
  "Accounting": ["Accounts Payable","Accounts Receivable","General Ledger","Taxation","GST Compliance","Audit"],
  "Corporate Finance": ["Financial Planning and Analysis","Financial Reporting","Costing","Payroll"]}');
select pg_temp.seed_tax(11, 'Human Resources', '{
  "Talent": ["Talent Acquisition","HR Business Partner","Learning and Development","Campus Hiring"],
  "Operations": ["HR Operations","Payroll and Compliance","Compensation and Benefits","Employee Relations","HRIS"]}');
select pg_temp.seed_tax(12, 'Sales and Marketing', '{
  "Sales": ["B2B Sales","B2C Sales","Key Account Management","Inside Sales","Channel Sales","Business Development"],
  "Marketing": ["Brand Management","Product Marketing","Market Research","Trade Marketing"]}');
select pg_temp.seed_tax(13, 'Digital Marketing', '{
  "Performance": ["SEO","Paid Search","Paid Social","Marketing Analytics","Marketing Automation"],
  "Content and Social": ["Content Marketing","Social Media Management","Email Marketing","Copywriting"]}');
select pg_temp.seed_tax(14, 'Construction and Real Estate', '{
  "Construction": ["Building Construction","MEP Coordination","Site Supervision","Health, Safety and Environment","Estimation and Costing"],
  "Real Estate": ["Real Estate Sales","Property Management","Facilities Management","Leasing"]}');
select pg_temp.seed_tax(15, 'Architecture and Interior Design', '{
  "Architecture": ["Architectural Design","Urban Planning","Landscape Architecture","BIM Modelling"],
  "Interiors": ["Interior Design","Fit-out Management","3D Visualisation"]}');
select pg_temp.seed_tax(16, 'Manufacturing', '{
  "Operations": ["Production Planning","Lean Manufacturing","Plant Operations","Maintenance","Industrial Engineering"],
  "Quality and Safety": ["Quality Assurance","Quality Control","Six Sigma","EHS"]}');
select pg_temp.seed_tax(17, 'Oil and Gas', '{
  "Upstream": ["Drilling","Reservoir Engineering","Production Operations"],
  "Midstream and Downstream": ["Pipeline Engineering","Process Engineering","Refinery Operations","Process Safety","Inspection and Integrity"]}');
select pg_temp.seed_tax(18, 'Healthcare and Pharmaceuticals', '{
  "Clinical": ["Nursing","Clinical Research","Medical Coding","Hospital Administration","Laboratory Services"],
  "Pharma": ["Regulatory Affairs","Pharmacovigilance","Pharma Quality Assurance","Pharma Production","Medical Sales"]}');
select pg_temp.seed_tax(19, 'Education and Training', '{
  "Teaching": ["School Teaching","Higher Education Faculty","Special Education","Test Preparation"],
  "Learning": ["Instructional Design","Corporate Training","Academic Administration","EdTech Content"]}');
select pg_temp.seed_tax(20, 'Legal and Compliance', '{
  "Legal": ["Corporate Law","Litigation","Contract Drafting","Intellectual Property","Company Secretarial"],
  "Compliance": ["Regulatory Compliance","Data Privacy","Internal Audit","Anti-Money Laundering"]}');
select pg_temp.seed_tax(21, 'Supply Chain and Logistics', '{
  "Logistics": ["Warehouse Management","Transportation","Freight Forwarding","Last-Mile Delivery","Import-Export Documentation"],
  "Planning": ["Demand Planning","Inventory Management","Supply Planning"]}');
select pg_temp.seed_tax(22, 'Procurement', '{
  "Sourcing": ["Strategic Sourcing","Vendor Development","Category Management","Contracts and Tendering"],
  "Purchasing": ["Purchase Operations","Project Procurement","Indirect Procurement"]}');
select pg_temp.seed_tax(23, 'Hospitality and Tourism', '{
  "Hotels": ["Front Office","Housekeeping","Food and Beverage Service","Culinary","Revenue Management"],
  "Travel": ["Travel Operations","Ticketing","Event Management"]}');
select pg_temp.seed_tax(24, 'Customer Service', '{
  "Support": ["Voice Support","Chat and Email Support","Technical Support","Customer Success"],
  "Operations": ["Team Leadership","Quality Monitoring","Workforce Management"]}');
select pg_temp.seed_tax(25, 'Administration and Operations', '{
  "Administration": ["Office Administration","Executive Assistance","Front Desk","Travel and Facilities"],
  "Operations": ["Business Operations","Back Office Operations","Process Excellence","Data Entry"]}');
select pg_temp.seed_tax(26, 'Research and Development', '{
  "Research": ["Product Research","Scientific Research","Laboratory Research","Patent Analysis"],
  "Development": ["New Product Development","Prototyping","Testing and Validation"]}');
select pg_temp.seed_tax(27, 'Government and Public Sector', '{
  "Public Programmes": ["Programme Management","Public Policy","Monitoring and Evaluation","E-Governance"],
  "Public Works": ["Public Works Engineering","Urban Development","Tender Management"]}');
select pg_temp.seed_tax(28, 'Media and Communications', '{
  "Editorial": ["Journalism","Content Writing","Editing","Technical Writing"],
  "Production": ["Video Production","Graphic Design","Animation"],
  "Communications": ["Public Relations","Corporate Communications"]}');
select pg_temp.seed_tax(29, 'Business Consulting', '{
  "Consulting": ["Strategy Consulting","Management Consulting","Business Analysis","Change Management","Process Consulting"],
  "Specialist": ["Risk Advisory","Technology Consulting","ESG and Sustainability"]}');
select pg_temp.seed_tax(30, 'Other Industries', '{"General": ["Other"]}');

insert into public.skills (name) values
  ('MIDAS Civil'),('STAAD.Pro'),('SOFiSTiK'),('AutoCAD'),('Revit'),('Primavera P6'),('MS Project'),('ETABS'),('SAP2000'),('AASHTO'),
  ('Eurocode'),('IS Codes'),('IRC Codes'),('Java'),('Spring Boot'),('Python'),('Django'),('JavaScript'),('TypeScript'),('React'),
  ('Angular'),('Node.js'),('SQL'),('PostgreSQL'),('MySQL'),('MongoDB'),('AWS'),('Azure'),('Google Cloud'),('Docker'),
  ('Kubernetes'),('Terraform'),('Git'),('Jenkins'),('Selenium'),('COBOL'),('JCL'),('DB2'),('Power BI'),('Tableau'),
  ('Excel'),('Tally'),('SAP FICO'),('SAP MM'),('Salesforce'),('Google Ads'),('SEO'),('Figma'),('Machine Learning'),('TensorFlow'),
  ('PyTorch'),('NLP'),('Financial Modelling'),('GST'),('Payroll'),('Recruitment'),('Negotiation'),('Project Management'),('Six Sigma'),('Communication')
on conflict do nothing;

-- ===================== supabase/migrations/0004_workspace.sql =====================
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

-- ===================== supabase/migrations/0005_regions_launch_walkins.sql =====================
-- Regions (launch metros), the free launch period, and walk-in interviews.

-- ───────────────────────── regions ─────────────────────────
create table public.regions (
  id serial primary key,
  slug text not null unique,
  name text not null unique,
  sort_order int not null default 0,
  is_active boolean not null default true,
  city_aliases text[] not null default '{}'      -- lower-case city names that belong to this region
);
insert into public.regions (slug, name, sort_order, city_aliases) values
  ('mumbai', 'Mumbai', 1, '{mumbai,bombay,navi mumbai,thane,kalyan,panvel,vasai,mira road,mumbai metropolitan region}'),
  ('pune', 'Pune', 2, '{pune,pimpri,chinchwad,pimpri-chinchwad,pimpri chinchwad,hinjewadi}'),
  ('delhi-ncr', 'Delhi NCR', 3, '{delhi,new delhi,delhi ncr,ncr,gurugram,gurgaon,noida,greater noida,ghaziabad,faridabad}'),
  ('bengaluru', 'Bengaluru', 4, '{bengaluru,bangalore}'),
  ('kolkata', 'Kolkata', 5, '{kolkata,calcutta,howrah,salt lake,new town}'),
  ('chennai', 'Chennai', 6, '{chennai,madras}'),
  ('hyderabad', 'Hyderabad', 7, '{hyderabad,secunderabad,cyberabad}');

alter table public.candidates add column region_id int references public.regions (id) on delete set null;
alter table public.employers add column region_id int references public.regions (id) on delete set null;
create index candidates_listed_region_idx on public.candidates (region_id, availability) where listed;

create or replace function public.tg_fill_region() returns trigger language plpgsql as $$
begin   -- derive the region from the city when it was not chosen explicitly
  if new.region_id is null and coalesce(new.city, '') <> '' then
    select id into new.region_id from public.regions where lower(trim(new.city)) = any (city_aliases) limit 1;
  end if;
  return new;
end $$;
create trigger candidates_region before insert or update of city, region_id on public.candidates for each row execute function public.tg_fill_region();
create trigger employers_region before insert or update of city, region_id on public.employers for each row execute function public.tg_fill_region();

-- ───────────────────────── free launch period ─────────────────────────
-- Candidate listing is free until the launch clock is started by an admin, and for `launch_free_days` after that.
insert into public.platform_settings (key, value) values ('launch_started_at', 'null'), ('launch_free_days', '60');

create or replace function public.launch_is_free() returns boolean
language sql stable security definer set search_path = public as $$
  select case when coalesce(public.setting('launch_started_at'), 'null'::jsonb) = 'null'::jsonb then true
    else now() < (public.setting('launch_started_at') #>> '{}')::timestamptz + make_interval(days => (public.setting('launch_free_days'))::int) end $$;

-- ───────────────────────── walk-in interviews ─────────────────────────
create table public.walkins (
  id uuid primary key default gen_random_uuid(),
  region_id int not null references public.regions (id) on delete cascade,
  company_name text not null check (char_length(company_name) between 2 and 160),
  role_title text not null check (char_length(role_title) between 2 and 200),
  summary text check (char_length(summary) <= 1500),          -- written in our own words, never copied listing text
  industry_id int references public.industries (id) on delete set null,
  experience_text text, qualification_text text, salary_text text,
  skills text[] not null default '{}',
  openings int check (openings > 0),
  start_date date not null,
  end_date date not null,
  time_text text,                                              -- e.g. "10:00 am – 2:00 pm"
  venue text, address text,
  how_to_attend text,                                          -- documents to carry, registration steps
  source_type text not null check (source_type in ('employer', 'admin', 'web')),
  source_name text, source_url text check (source_url is null or source_url ~* '^https?://'),
  employer_id uuid references public.employers (id) on delete cascade,
  verified boolean not null default false,                     -- posted by a verified employer, or confirmed by our team
  status text not null default 'published' check (status in ('published', 'hidden')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date <= 31),
  check (source_type <> 'web' or source_url is not null)       -- anything taken from the web must link to where it came from
);
create index walkins_region_dates_idx on public.walkins (region_id, start_date, end_date) where status = 'published';
create unique index walkins_dedupe_idx on public.walkins (region_id, lower(company_name), lower(role_title), start_date);

alter table public.regions enable row level security;
alter table public.walkins enable row level security;
create policy regions_read on public.regions for select to anon, authenticated using (is_active or public.is_admin());
create policy walkins_read on public.walkins for select to anon, authenticated
  using (status = 'published' or employer_id = public.my_employer_id() or public.is_admin());
-- A verified employer may publish and manage its own walk-ins; they are shown as "verified employer".
create policy walkins_employer_insert on public.walkins for insert to authenticated with check (
  source_type = 'employer' and verified and employer_id = public.my_employer_id() and created_by = auth.uid()
  and exists (select 1 from public.employers e where e.id = employer_id and e.verification_status = 'verified'));
create policy walkins_employer_update on public.walkins for update to authenticated
  using (employer_id = public.my_employer_id()) with check (employer_id = public.my_employer_id() and source_type = 'employer' and verified);
create policy walkins_employer_delete on public.walkins for delete to authenticated using (employer_id = public.my_employer_id());

grant select on public.regions, public.walkins to anon, authenticated;
grant insert, update, delete on public.walkins to authenticated;
grant all on public.regions, public.walkins to service_role;
grant usage on all sequences in schema public to authenticated;
revoke all on function public.launch_is_free() from public;
grant execute on function public.launch_is_free() to anon, authenticated, service_role;

-- public aggregates now include regions and upcoming walk-ins (IST calendar days)
create or replace function public.public_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'listed_candidates', (select count(*) from candidates where listed),
    'verified_employers', (select count(*) from employers where verification_status = 'verified'),
    'industries', (select count(*) from industries where is_active),
    'by_industry', coalesce((select jsonb_object_agg(slug, n) from (
        select i.slug, count(c.user_id) n from industries i left join candidates c on c.industry_id = i.id and c.listed
        where i.is_active group by i.slug) t), '{}'),
    'by_region', coalesce((select jsonb_object_agg(slug, n) from (
        select r.slug, count(c.user_id) n from regions r left join candidates c on c.region_id = r.id and c.listed
        where r.is_active group by r.slug) t), '{}'),
    'walkins_by_region', coalesce((select jsonb_object_agg(slug, n) from (
        select r.slug, count(w.id) n from regions r left join walkins w on w.region_id = r.id and w.status = 'published'
          and w.end_date >= (now() at time zone 'Asia/Kolkata')::date and w.start_date <= (now() at time zone 'Asia/Kolkata')::date + 7
        where r.is_active group by r.slug) t), '{}')) $$;

-- Optional: extend the free launch period to employers too (off by default; verification is still required).
insert into public.platform_settings (key, value) values ('launch_free_employers', 'false');
create or replace function public.employer_has_access(p_employer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from subscriptions where employer_id = p_employer and access_until > now())
      or (coalesce((public.setting('launch_free_employers'))::boolean, false) and public.launch_is_free()) $$;

-- the public walk-in policy calls this helper; for a signed-out visitor it simply returns null
grant execute on function public.my_employer_id() to anon;

-- ===================== check =====================
select (select count(*) from public.industries) as industries,
       (select count(*) from public.specialisations) as specialisations,
       (select count(*) from public.regions) as regions,
       (select count(*) from public.plans) as plans,
       (select count(*) from pg_tables where schemaname = 'public') as tables,
       (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity) as tables_without_rls,
       (select count(*) from pg_policies where schemaname = 'public') as policies;
