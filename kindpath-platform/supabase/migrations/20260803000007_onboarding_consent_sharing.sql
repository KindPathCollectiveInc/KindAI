-- Onboarding/offboarding checklists (with WWCC / NDIS Worker Screening
-- expiry tracking), the consent & sharing register, and share tokens for
-- the public read-only Coordinated Summary route.

create type public.onboarding_step as enum (
  'wwcc', 'ndis_screening', 'orientation', 'code_of_conduct', 'referees', 'induction'
);

create table public.onboarding_records (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id),
  person_id        uuid not null references public.profiles(id) on delete cascade,
  step             public.onboarding_step not null,
  completed        boolean not null default false,
  completed_date   date,
  -- Only meaningful for steps with a statutory renewal cycle (wwcc,
  -- ndis_screening). Drives the 90-day dashboard expiry alert.
  expiry_date      date,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (person_id, step)
);

create index onboarding_records_expiry_idx on public.onboarding_records (expiry_date)
  where expiry_date is not null;

create trigger onboarding_records_set_organisation_id
  before insert on public.onboarding_records
  for each row execute function public.set_organisation_id();

create trigger onboarding_records_set_updated_at
  before update on public.onboarding_records
  for each row execute function public.set_updated_at();

alter table public.onboarding_records enable row level security;

-- Workforce compliance is a governance concern (committee needs to see
-- screening-expiry risk across the workforce) as well as an operational
-- one (admin/care_advocacy manage onboarding). A person may also view
-- (but not alter) their own record.
create policy onboarding_records_select on public.onboarding_records
  for select using (
    organisation_id = public.current_org()
    and (
      public.has_role(array['admin', 'care_advocacy', 'committee'])
      or person_id = auth.uid()
    )
  );

create policy onboarding_records_write on public.onboarding_records
  for all using (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy'])
  )
  with check (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy'])
  );

create type public.consent_scope as enum (
  'routines_only', 'routines_and_comms', 'full_summary'
);

create type public.consent_status as enum ('active', 'expired', 'revoked');

create table public.consent_records (
  id                    uuid primary key default gen_random_uuid(),
  organisation_id       uuid not null references public.organisations(id),
  client_id             uuid not null references public.clients(id) on delete cascade,
  external_service_name text not null,
  contact_name          text,
  scope                 public.consent_scope not null,
  consent_date          date not null default current_date,
  review_date           date,
  status                public.consent_status not null default 'active',
  notes                 text,
  created_by            uuid references public.profiles(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index consent_records_client_id_idx on public.consent_records (client_id);

create trigger consent_records_set_organisation_id
  before insert on public.consent_records
  for each row execute function public.set_organisation_id();

create trigger consent_records_set_updated_at
  before update on public.consent_records
  for each row execute function public.set_updated_at();

alter table public.consent_records enable row level security;

-- Consent-to-share configuration is a coordination function, not a
-- frontline one — contractors do not manage who external services are
-- allowed to see a participant's information.
create policy consent_records_select on public.consent_records
  for select using (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy', 'committee'])
  );

create policy consent_records_insert on public.consent_records
  for insert with check (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy'])
  );

create policy consent_records_update on public.consent_records
  for update using (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy'])
  );

-- No delete policy: who a client's information may be shared with is
-- exactly the kind of substantial record that must go through the
-- deletion_requests gate (see 20260803000017), not a raw admin DELETE —
-- use consent_records.status = 'revoked' for the ordinary case of
-- ending a sharing arrangement.

-- Share tokens: the credential behind the public, unauthenticated
-- Coordinated Summary route. The token value itself is only ever
-- returned to the authenticated caller who creates it (the app displays
-- it once, like an API key) — this table is never exposed to the public
-- route directly; the public route calls a SECURITY DEFINER RPC instead
-- (see 20260803000011_share_token_rpc.sql) so anonymous readers never
-- get SELECT on this table.
create table public.share_tokens (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id),
  client_id        uuid not null references public.clients(id) on delete cascade,
  -- hex, not base64url — encode() has no base64url mode, and hex needs
  -- no further escaping to be safely embedded in a URL path segment.
  token            text not null unique default encode(gen_random_bytes(24), 'hex'),
  scope            public.consent_scope not null default 'routines_and_comms',
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  expires_at       timestamptz,
  revoked          boolean not null default false
);

create index share_tokens_token_idx on public.share_tokens (token);
create index share_tokens_client_id_idx on public.share_tokens (client_id);

create trigger share_tokens_set_organisation_id
  before insert on public.share_tokens
  for each row execute function public.set_organisation_id();

alter table public.share_tokens enable row level security;

-- No anonymous access to this table at all — see the RPC note above.
create policy share_tokens_select on public.share_tokens
  for select using (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy'])
  );

create policy share_tokens_write on public.share_tokens
  for all using (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy'])
  )
  with check (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy'])
  );
