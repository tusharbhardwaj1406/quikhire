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
