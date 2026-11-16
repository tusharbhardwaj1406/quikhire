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
