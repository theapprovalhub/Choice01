-- ============================================================
-- CHOICE PROPERTIES — Database Schema
-- Run this entire file once in: Supabase → SQL Editor
-- Run this ENTIRE file once in: Supabase → SQL Editor
-- This is the single source of truth going forward.
-- ============================================================
-- ORDER OF OPERATIONS:
--   1. Enums
--   2. Core tables (landlords, properties, inquiries)
--   3. Applications (full schema)
--   4. Lease records
--   5. Messages
--   6. Email logs
--   7. Admin roles
--   8. Triggers & functions
--   9. Row Level Security
--  10. Views
--  11. Storage buckets
-- ============================================================


-- ============================================================
-- 0. EXTENSIONS
-- ============================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";


-- ============================================================
-- 1. ENUMS
-- ============================================================

do $$ begin
  create type account_type as enum (
    'landlord',
    'property_owner',
    'realtor',
    'brokerage',
    'agency',
    'llc',
    'property_management'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type application_status as enum (
    'pending',
    'under_review',
    'approved',
    'denied',
    'withdrawn',
    'waitlisted'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum (
    'unpaid',
    'paid',
    'waived',
    'refunded'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type lease_status as enum (
    'none',
    'sent',
    'signed',
    'awaiting_co_sign',
    'co_signed',
    'voided',
    'expired'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type movein_status as enum (
    'pending',
    'scheduled',
    'confirmed',
    'completed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type property_status as enum (
    'draft',
    'active',
    'paused',
    'rented',
    'archived'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type message_sender as enum (
    'admin',
    'tenant'
  );
exception when duplicate_object then null; end $$;


-- ============================================================
-- 2. ADMIN ROLES TABLE
-- Tracks which Supabase auth users are admins
-- ============================================================
create table if not exists admin_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade unique not null,
  email      text not null,
  created_at timestamptz default now()
);


-- ============================================================
-- 3. LANDLORDS TABLE
-- ============================================================
create table if not exists landlords (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) on delete cascade unique,
  account_type        account_type not null default 'landlord',
  contact_name        text not null,
  business_name       text,
  email               text not null,
  phone               text,
  address             text,
  city                text,
  state               text,
  zip                 text,
  avatar_url          text,
  tagline             text,
  bio                 text,
  website             text,
  license_number      text,
  license_state       text,
  years_experience    int,
  specialties         text[],
  social_facebook     text,
  social_instagram    text,
  social_linkedin     text,
  verified            boolean default false,
  plan                text default 'free',
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);


-- ============================================================
-- 4. PROPERTIES TABLE
-- ============================================================
create table if not exists properties (
  id                    text primary key,
  landlord_id           uuid references landlords(id) on delete cascade,
  status                property_status default 'draft',
  title                 text not null,
  description           text,
  showing_instructions  text,
  address               text not null,
  city                  text not null,
  state                 text not null,
  zip                   text not null,
  county                text,
  lat                   float,
  lng                   float,
  property_type         text,
  year_built            int,
  floors                int,
  unit_number           text,
  total_units           int,
  bedrooms              int,
  bathrooms             float,
  half_bathrooms        int,
  square_footage        int,
  lot_size_sqft         int,
  garage_spaces         int,
  monthly_rent          int not null,
  security_deposit      int,
  last_months_rent      int,
  application_fee       int default 0,
  pet_deposit           int,
  admin_fee             int,
  move_in_special       text,
  available_date        date,
  lease_terms           text[],
  minimum_lease_months  int,
  pets_allowed          boolean default false,
  pet_types_allowed     text[],
  pet_weight_limit      int,
  pet_details           text,
  smoking_allowed       boolean default false,
  utilities_included    text[],
  parking               text,
  parking_fee           int,
  amenities             text[],
  appliances            text[],
  flooring              text[],
  heating_type          text,
  cooling_type          text,
  laundry_type          text,
  photo_urls            text[],
  virtual_tour_url      text,
  views_count           int default 0,
  applications_count    int default 0,
  saves_count           int default 0,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);


-- ============================================================
-- 5. INQUIRIES TABLE
-- ============================================================
create table if not exists inquiries (
  id           uuid primary key default gen_random_uuid(),
  property_id  text references properties(id) on delete cascade,
  tenant_name  text not null,
  tenant_email text not null,
  tenant_phone text,
  message      text,
  read         boolean default false,
  created_at   timestamptz default now()
);


-- ============================================================
-- 6. APPLICATIONS TABLE
-- ============================================================
create table if not exists applications (
  -- ── Identity ──────────────────────────────────────────────
  id                          uuid primary key default gen_random_uuid(),
  app_id                      text unique not null,
  created_at                  timestamptz default now(),
  updated_at                  timestamptz default now(),

  -- ── Status & Admin ────────────────────────────────────────
  status                      application_status default 'pending',
  payment_status              payment_status default 'unpaid',
  payment_date                timestamptz,
  admin_notes                 text,
  application_fee             int default 0,

  -- ── Property & Landlord Link ──────────────────────────────
  property_id                 text references properties(id) on delete set null,
  landlord_id                 uuid references landlords(id) on delete set null,
  property_address            text,

  -- ── Applicant Personal Info ───────────────────────────────
  first_name                  text not null,
  last_name                   text not null,
  email                       text not null,
  phone                       text not null,
  dob                         text,
  ssn                         text,
  requested_move_in_date      text,
  desired_lease_term          text,

  -- ── Current Residence ─────────────────────────────────────
  current_address             text,
  residency_duration          text,
  current_rent_amount         text,
  reason_for_leaving          text,
  current_landlord_name       text,
  landlord_phone              text,

  -- ── Employment ────────────────────────────────────────────
  employment_status           text,
  employer                    text,
  job_title                   text,
  employment_duration         text,
  supervisor_name             text,
  supervisor_phone            text,
  monthly_income              text,
  other_income                text,

  -- ── References ────────────────────────────────────────────
  reference_1_name            text,
  reference_1_phone           text,
  reference_2_name            text,
  reference_2_phone           text,

  -- ── Emergency Contact ─────────────────────────────────────
  emergency_contact_name         text,
  emergency_contact_phone        text,
  emergency_contact_relationship text,

  -- ── Payment Preferences ───────────────────────────────────
  primary_payment_method           text,
  primary_payment_method_other     text,
  alternative_payment_method       text,
  alternative_payment_method_other text,
  third_choice_payment_method      text,
  third_choice_payment_method_other text,

  -- ── Household ─────────────────────────────────────────────
  has_pets           boolean default false,
  pet_details        text,
  total_occupants    text,
  additional_occupants text,
  ever_evicted       boolean default false,
  smoker             boolean default false,

  -- ── Contact Preferences ───────────────────────────────────
  preferred_language       text default 'en',
  preferred_contact_method text,
  preferred_time           text,
  preferred_time_specific  text,

  -- ── Vehicle ───────────────────────────────────────────────
  vehicle_make          text,
  vehicle_model         text,
  vehicle_year          text,
  vehicle_license_plate text,

  -- ── Co-Applicant ──────────────────────────────────────────
  has_co_applicant                 boolean default false,
  additional_person_role           text,
  co_applicant_first_name          text,
  co_applicant_last_name           text,
  co_applicant_email               text,
  co_applicant_phone               text,
  co_applicant_dob                 text,
  co_applicant_ssn                 text,
  co_applicant_employer            text,
  co_applicant_job_title           text,
  co_applicant_monthly_income      text,
  co_applicant_employment_duration text,
  co_applicant_consent             boolean default false,

  -- ── Document Upload ───────────────────────────────────────
  document_url text,

  -- ── Lease ─────────────────────────────────────────────────
  lease_status             lease_status default 'none',
  lease_sent_date          timestamptz,
  lease_signed_date        timestamptz,
  lease_start_date         date,
  lease_end_date           date,
  monthly_rent             numeric(10,2),
  security_deposit         numeric(10,2),
  move_in_costs            numeric(10,2),
  lease_notes              text,
  lease_late_fee_flat      numeric(10,2) default 50,
  lease_late_fee_daily     numeric(10,2) default 10,
  lease_expiry_date        timestamptz,
  lease_state_code         text,
  lease_landlord_name      text,
  lease_landlord_address   text,
  lease_pets_policy        text,
  lease_smoking_policy     text,
  lease_compliance_snapshot text,
  lease_pdf_url            text,

  -- ── Signatures ────────────────────────────────────────────
  tenant_signature                     text,
  signature_timestamp                  timestamptz,
  lease_ip_address                     text,
  co_applicant_signature               text,
  co_applicant_signature_timestamp     timestamptz,
  co_applicant_lease_token             text,

  -- ── Move-In ───────────────────────────────────────────────
  move_in_status        movein_status,
  move_in_date_actual   date,
  move_in_notes         text,
  move_in_confirmed_by  text
);


-- ============================================================
-- 7. MESSAGES TABLE
-- ============================================================
create table if not exists messages (
  id          uuid primary key default gen_random_uuid(),
  app_id      text not null references applications(app_id) on delete cascade,
  sender      message_sender not null,
  sender_name text,
  message     text not null,
  read        boolean default false,
  created_at  timestamptz default now()
);


-- ============================================================
-- 8. EMAIL LOGS TABLE
-- ============================================================
create table if not exists email_logs (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  type       text not null,
  recipient  text not null,
  status     text not null,
  app_id     text,
  error_msg  text
);


-- ============================================================
-- 9. SAVED PROPERTIES TABLE
-- ============================================================
create table if not exists saved_properties (
  id          uuid primary key default gen_random_uuid(),
  session_id  text,
  property_id text references properties(id) on delete cascade,
  created_at  timestamptz default now()
);


-- ============================================================
-- 10. TRIGGER FUNCTION — auto-update updated_at
-- ============================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;

drop trigger if exists landlords_updated_at    on landlords;
drop trigger if exists properties_updated_at   on properties;
drop trigger if exists applications_updated_at on applications;

create trigger landlords_updated_at
  before update on landlords
  for each row execute function set_updated_at();

create trigger properties_updated_at
  before update on properties
  for each row execute function set_updated_at();

create trigger applications_updated_at
  before update on applications
  for each row execute function set_updated_at();


-- ============================================================
-- 11. HELPER FUNCTIONS
-- ============================================================

create or replace function increment_counter(
  p_table  text,
  p_id     text,
  p_column text
) returns void language plpgsql security definer as $$
begin
  execute format(
    'update %I set %I = coalesce(%I, 0) + 1 where id = $1',
    p_table, p_column, p_column
  ) using p_id;
end;
$$;

create or replace function is_admin()
returns boolean language plpgsql security definer as $$
begin
  return exists (
    select 1 from admin_roles where user_id = auth.uid()
  );
end;
$$;

create or replace function generate_app_id()
returns text language plpgsql as $$
declare
  v_date   text;
  v_random text;
  v_ms     text;
  v_id     text;
begin
  v_date   := to_char(now(), 'YYYYMMDD');
  v_random := upper(substring(encode(gen_random_bytes(4), 'hex'), 1, 6));
  v_ms     := lpad((extract(milliseconds from now())::int % 1000)::text, 3, '0');
  v_id     := 'CP-' || v_date || '-' || v_random || v_ms;
  -- Retry on collision (astronomically unlikely but correct)
  if exists (select 1 from applications where app_id = v_id) then
    return generate_app_id();
  end if;
  return v_id;
end;
$$;


-- ============================================================
-- 12. ROW LEVEL SECURITY
-- ============================================================

alter table admin_roles       enable row level security;
alter table landlords         enable row level security;
alter table properties        enable row level security;
alter table inquiries         enable row level security;
alter table applications      enable row level security;
alter table messages          enable row level security;
alter table email_logs        enable row level security;
alter table saved_properties  enable row level security;

do $$ declare r record; begin
  for r in (
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'admin_roles','landlords','properties','inquiries',
        'applications','messages','email_logs','saved_properties'
      )
  ) loop
    execute format('drop policy if exists %I on %I.%I',
      r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

create policy "admin_roles_self_read" on admin_roles
  for select using (user_id = auth.uid());

create policy "landlords_admin_all" on landlords
  for all using (is_admin());

create policy "landlords_own_read" on landlords
  for select using (user_id = auth.uid());

create policy "landlords_own_write" on landlords
  for all using (user_id = auth.uid());

create policy "properties_admin_all" on properties
  for all using (is_admin());

create policy "properties_public_read" on properties
  for select using (status = 'active');

create policy "properties_landlord_read" on properties
  for select using (
    landlord_id = (select id from landlords where user_id = auth.uid())
    or status = 'active'
  );

create policy "properties_landlord_write" on properties
  for all using (
    landlord_id = (select id from landlords where user_id = auth.uid())
  )
  with check (
    landlord_id = (select id from landlords where user_id = auth.uid())
  );

create policy "inquiries_admin_all" on inquiries
  for all using (is_admin());

create policy "inquiries_public_insert" on inquiries
  for insert with check (true);

create policy "inquiries_landlord_read" on inquiries
  for select using (
    property_id in (
      select id from properties
      where landlord_id = (select id from landlords where user_id = auth.uid())
    )
  );

create policy "inquiries_landlord_update" on inquiries
  for update using (
    property_id in (
      select id from properties
      where landlord_id = (select id from landlords where user_id = auth.uid())
    )
  );

create policy "applications_admin_all" on applications
  for all using (is_admin());

create policy "applications_landlord_read" on applications
  for select using (
    landlord_id = (select id from landlords where user_id = auth.uid())
  );

create policy "applications_public_insert" on applications
  for insert with check (true);

create policy "messages_admin_all" on messages
  for all using (is_admin());

create policy "messages_landlord_read" on messages
  for select using (
    app_id in (
      select app_id from applications
      where landlord_id = (select id from landlords where user_id = auth.uid())
    )
  );

create policy "email_logs_admin_all" on email_logs
  for all using (is_admin());

create policy "saved_properties_own" on saved_properties
  for all using (true)
  with check (true);


-- ============================================================
-- 13. SECURE FUNCTION — Get application status
-- ============================================================
create or replace function get_application_status(p_app_id text)
returns json language plpgsql security definer as $$
declare
  v_app applications%rowtype;
  v_msgs json;
begin
  select * into v_app from applications where app_id = p_app_id;

  if not found then
    return json_build_object('success', false, 'error', 'Application not found');
  end if;

  select json_agg(
    json_build_object(
      'sender',      sender,
      'sender_name', sender_name,
      'message',     message,
      'read',        read,
      'created_at',  created_at
    ) order by created_at asc
  ) into v_msgs
  from messages
  where app_id = p_app_id;

  return json_build_object(
    'success', true,
    'application', json_build_object(
      'app_id',                    v_app.app_id,
      'first_name',                v_app.first_name,
      'last_name',                 v_app.last_name,
      'email',                     v_app.email,
      'status',                    v_app.status,
      'payment_status',            v_app.payment_status,
      'lease_status',              v_app.lease_status,
      'lease_expiry_date',         v_app.lease_expiry_date,
      'lease_start_date',          v_app.lease_start_date,
      'lease_end_date',            v_app.lease_end_date,
      'lease_signed_date',         v_app.lease_signed_date,
      'lease_pdf_url',             v_app.lease_pdf_url,
      'monthly_rent',              v_app.monthly_rent,
      'security_deposit',          v_app.security_deposit,
      'move_in_costs',             v_app.move_in_costs,
      'lease_late_fee_flat',       v_app.lease_late_fee_flat,
      'lease_late_fee_daily',      v_app.lease_late_fee_daily,
      'move_in_status',            v_app.move_in_status,
      'move_in_date_actual',       v_app.move_in_date_actual,
      'property_address',          v_app.property_address,
      'desired_lease_term',        v_app.desired_lease_term,
      'has_co_applicant',          v_app.has_co_applicant,
      'co_applicant_email',        v_app.co_applicant_email,
      'co_applicant_first_name',   v_app.co_applicant_first_name,
      'co_applicant_last_name',    v_app.co_applicant_last_name,
      'co_applicant_signature',    v_app.co_applicant_signature,
      'lease_landlord_name',       v_app.lease_landlord_name,
      'lease_landlord_address',    v_app.lease_landlord_address,
      'lease_pets_policy',         v_app.lease_pets_policy,
      'lease_smoking_policy',      v_app.lease_smoking_policy,
      'lease_compliance_snapshot', v_app.lease_compliance_snapshot,
      'tenant_signature',          v_app.tenant_signature,
      'lease_ip_address',          v_app.lease_ip_address,
      'created_at',                v_app.created_at,
      'updated_at',                v_app.updated_at
    ),
    'messages', coalesce(v_msgs, '[]'::json)
  );
end;
$$;

grant execute on function get_application_status(text) to anon, authenticated;


-- ============================================================
-- 14. SECURE FUNCTION — Submit tenant reply
-- ============================================================
create or replace function submit_tenant_reply(p_app_id text, p_message text, p_name text)
returns json language plpgsql security definer as $$
begin
  if not exists (select 1 from applications where app_id = p_app_id) then
    return json_build_object('success', false, 'error', 'Application not found');
  end if;

  insert into messages (app_id, sender, sender_name, message)
  values (p_app_id, 'tenant', p_name, p_message);

  return json_build_object('success', true);
end;
$$;

grant execute on function submit_tenant_reply(text, text, text) to anon, authenticated;


-- ============================================================
-- 15. SECURE FUNCTION — Sign lease
-- ============================================================
create or replace function sign_lease(
  p_app_id    text,
  p_signature text,
  p_ip        text
) returns json language plpgsql security definer as $$
declare
  v_app applications%rowtype;
begin
  select * into v_app from applications where app_id = p_app_id;

  if not found then
    return json_build_object('success', false, 'error', 'Application not found');
  end if;

  if v_app.lease_status = 'voided' then
    return json_build_object('success', false, 'error', 'This lease has been voided');
  end if;

  if v_app.lease_status = 'expired' or
     (v_app.lease_expiry_date is not null and v_app.lease_expiry_date < now()) then
    update applications set lease_status = 'expired' where app_id = p_app_id;
    return json_build_object('success', false, 'error', 'This lease link has expired');
  end if;

  if v_app.tenant_signature is not null then
    return json_build_object('success', false, 'error', 'Lease already signed');
  end if;

  update applications set
    tenant_signature    = p_signature,
    signature_timestamp = now(),
    lease_ip_address    = p_ip,
    lease_status        = case
                            when has_co_applicant then 'awaiting_co_sign'
                            else 'signed'
                          end,
    lease_signed_date   = now()
  where app_id = p_app_id;

  return json_build_object('success', true, 'app_id', p_app_id);
end;
$$;

grant execute on function sign_lease(text, text, text) to anon, authenticated;


-- ============================================================
-- 16. SECURE FUNCTION — Co-sign lease
-- ============================================================
create or replace function sign_lease_co_applicant(
  p_app_id    text,
  p_signature text,
  p_ip        text
) returns json language plpgsql security definer as $$
begin
  if not exists (select 1 from applications where app_id = p_app_id and has_co_applicant = true) then
    return json_build_object('success', false, 'error', 'No co-applicant on this application');
  end if;

  if exists (select 1 from applications where app_id = p_app_id and co_applicant_signature is not null) then
    return json_build_object('success', false, 'error', 'Co-applicant lease already signed');
  end if;

  update applications set
    co_applicant_signature           = p_signature,
    co_applicant_signature_timestamp = now(),
    lease_status                     = 'co_signed'
  where app_id = p_app_id;

  return json_build_object('success', true);
end;
$$;

grant execute on function sign_lease_co_applicant(text, text, text) to anon, authenticated;


-- ============================================================
-- 17. VIEWS
-- ============================================================

create or replace view public_landlord_profiles as
  select
    id, account_type, business_name, contact_name,
    avatar_url, tagline, bio, phone, website,
    license_number, license_state, years_experience,
    specialties, social_facebook, social_instagram,
    social_linkedin, verified, created_at
  from landlords;

grant select on public_landlord_profiles to anon, authenticated;

create or replace view admin_application_view with (security_invoker=on) as
  select
    a.id,
    a.app_id,
    a.created_at,
    a.updated_at,
    a.status,
    a.payment_status,
    a.payment_date,
    a.admin_notes,
    a.first_name,
    a.last_name,
    a.email,
    a.phone,
    a.property_address,
    a.property_id,
    a.landlord_id,
    a.lease_status,
    a.lease_sent_date,
    a.lease_signed_date,
    a.lease_start_date,
    a.lease_end_date,
    a.monthly_rent,
    a.security_deposit,
    a.move_in_costs,
    a.lease_late_fee_flat,
    a.lease_late_fee_daily,
    a.lease_expiry_date,
    a.tenant_signature,
    a.co_applicant_signature,
    a.has_co_applicant,
    a.co_applicant_first_name,
    a.co_applicant_last_name,
    a.co_applicant_email,
    a.move_in_status,
    a.move_in_date_actual,
    a.move_in_notes,
    a.primary_payment_method,
    a.alternative_payment_method,
    a.third_choice_payment_method,
    a.employment_status,
    a.employer,
    a.monthly_income,
    l.contact_name  as landlord_name,
    l.business_name as landlord_business,
    p.title         as property_title,
    p.city          as property_city,
    p.state         as property_state
  from applications a
  left join landlords l on a.landlord_id = l.id
  left join properties p on a.property_id = p.id;


-- ============================================================
-- 18. STORAGE BUCKETS
-- ============================================================
insert into storage.buckets (id, name, public)
  values ('property-photos', 'property-photos', true)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
  values ('profile-photos', 'profile-photos', true)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
  values ('application-docs', 'application-docs', false)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
  values ('lease-pdfs', 'lease-pdfs', false)
  on conflict (id) do nothing;

do $$ declare r record; begin
  for r in (
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
  ) loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;

create policy "property_photos_read"   on storage.objects for select using (bucket_id = 'property-photos');
create policy "property_photos_insert" on storage.objects for insert to authenticated with check (bucket_id = 'property-photos');
create policy "property_photos_update" on storage.objects for update to authenticated using (bucket_id = 'property-photos');

create policy "profile_photos_read"    on storage.objects for select using (bucket_id = 'profile-photos');
create policy "profile_photos_insert"  on storage.objects for insert to authenticated with check (bucket_id = 'profile-photos');
create policy "profile_photos_update"  on storage.objects for update to authenticated using (bucket_id = 'profile-photos');

create policy "app_docs_insert"        on storage.objects for insert with check (bucket_id = 'application-docs');
create policy "app_docs_read_auth"     on storage.objects for select to authenticated using (bucket_id = 'application-docs');

create policy "lease_pdfs_read_auth"   on storage.objects for select to authenticated using (bucket_id = 'lease-pdfs');
create policy "lease_pdfs_insert_auth" on storage.objects for insert to authenticated with check (bucket_id = 'lease-pdfs');


-- ============================================================
-- 19. REALTIME
-- ============================================================
alter publication supabase_realtime add table applications;
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table inquiries;
alter publication supabase_realtime add table properties;


-- ============================================================
-- 20. INDEXES
-- ============================================================
create index if not exists idx_applications_app_id      on applications(app_id);
create index if not exists idx_applications_status      on applications(status);
create index if not exists idx_applications_landlord_id on applications(landlord_id);
create index if not exists idx_applications_property_id on applications(property_id);
create index if not exists idx_applications_email       on applications(email);
create index if not exists idx_applications_created_at  on applications(created_at desc);
create index if not exists idx_messages_app_id          on messages(app_id);
create index if not exists idx_properties_landlord_id   on properties(landlord_id);
create index if not exists idx_properties_status        on properties(status);
create index if not exists idx_email_logs_app_id        on email_logs(app_id);
create index if not exists idx_inquiries_property_id    on inquiries(property_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'applications_app_id_unique'
  ) THEN
    ALTER TABLE applications
      ADD CONSTRAINT applications_app_id_unique UNIQUE (app_id);
  END IF;
END $$;


-- ============================================================
-- 21. SECURE FUNCTION — Look up app_id by email
-- ============================================================
create or replace function get_app_id_by_email(p_email text)
returns text language plpgsql security definer as $$
declare
  v_app_id text;
begin
  select app_id into v_app_id
  from applications
  where lower(email) = lower(p_email)
  order by created_at desc
  limit 1;

  return v_app_id;
end;
$$;

grant execute on function get_app_id_by_email(text) to anon, authenticated;


-- ============================================================
-- 21b. SECURE FUNCTION — Look up ALL app_ids by email
--      Returns a JSON array of {app_id, property_address, status, created_at}
--      safe for anon callers — no PII beyond what the applicant already knows.
-- ============================================================
create or replace function get_apps_by_email(p_email text)
returns json language plpgsql security definer as $$
begin
  return (
    select coalesce(json_agg(row_to_json(r) order by r.created_at desc), '[]'::json)
    from (
      select app_id,
             property_address,
             status,
             created_at::date as created_at
      from applications
      where lower(email) = lower(p_email)
    ) r
  );
end;
$$;

grant execute on function get_apps_by_email(text) to anon, authenticated;


-- 22. NOTE — lease_pdf_url stores storage PATH not signed URL
-- ============================================================
-- lease_pdf_url stores only the
-- storage object path (e.g. 'lease-CP-XXXXX-signed.html'),
-- NOT a time-limited signed URL.
--
-- Fresh signed URLs are generated on-demand by the application
-- layer (Edge Function or client) using the storage path.
-- This prevents the stored URL from expiring and breaking the
-- tenant dashboard lease download link.
--
-- To generate a signed URL from the path, use the Supabase
-- Storage API: storage.from('lease-pdfs').createSignedUrl(path, seconds)
-- ============================================================


-- ============================================================
-- 23. SERVER-SIDE PROPERTY ID GENERATOR
-- ============================================================
-- Generates IDs of the format PROP-XXXXXXXX (8 uppercase alphanumeric chars).
-- Called by the Properties.create() API layer instead of the client-side
-- generatePropertyId() function, so IDs are always generated server-side.
-- ============================================================
create or replace function generate_property_id()
returns text language plpgsql as $$
declare
  v_chars text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  v_id    text := 'PROP-';
  v_i     int;
  v_bytes bytea;
begin
  v_bytes := gen_random_bytes(8);
  for v_i in 0..7 loop
    v_id := v_id || substr(v_chars, (get_byte(v_bytes, v_i) % 36) + 1, 1);
  end loop;
  -- Retry if collision (extremely unlikely but correct)
  if exists (select 1 from properties where id = v_id) then
    return generate_property_id();
  end if;
  return v_id;
end;
$$;


-- ============================================================
-- DONE.
-- ============================================================
-- Next steps:
--   1. Run SECURITY-PATCHES.sql as a separate query
--   2. Set up GAS-EMAIL-RELAY.gs in Google Apps Script
--   3. Add your first admin:
--      INSERT INTO admin_roles (user_id, email)
--      VALUES ('your-uid', 'your@email.com');
--   4. Deploy Edge Functions via GitHub Actions
--   5. Configure config.js with your Supabase URL and anon key
-- ============================================================
