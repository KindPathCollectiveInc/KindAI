-- Reportable incidents and the organisational risk register.
--
-- Incident categories cover the NDIS Commission's reportable-incident
-- categories AND broader WHS/security events — a SIL-adjacent operation
-- sits at the convergence of participant safety, workforce safety, and
-- premises/security, and one incident intake shouldn't force staff to
-- guess which of three separate logs to use.

create type public.incident_domain as enum (
  'ndis_reportable', 'whs', 'security', 'other'
);

create type public.incident_category as enum (
  'death',
  'serious_injury',
  'abuse',
  'neglect',
  'unlawful_sexual_contact',
  'unlawful_physical_contact',
  'sexual_misconduct',
  'use_of_restrictive_practice',
  'workplace_injury',
  'near_miss',
  'property_security',
  'other'
);

create type public.incident_status as enum (
  'open', 'notified', 'under_review', 'closed'
);

create table public.reportable_incidents (
  id                        uuid primary key default gen_random_uuid(),
  organisation_id           uuid not null references public.organisations(id),
  domain                    public.incident_domain not null default 'ndis_reportable',
  category                  public.incident_category not null,
  client_id                 uuid references public.clients(id),
  reported_by               uuid not null references public.profiles(id),
  incident_at               timestamptz not null,
  discovered_at             timestamptz not null default now(),
  description               text not null,
  immediate_action_taken    text,
  is_ndis_reportable        boolean not null default false,
  -- Populated by staff per the org's adopted notification policy
  -- (e.g. 24 hours for the most serious NDIS Commission categories) —
  -- the platform tracks the deadline the org sets; it does not itself
  -- determine statutory classification.
  notification_due_at       timestamptz,
  notified_at                timestamptz,
  notified_body              text,
  status                    public.incident_status not null default 'open',
  outcome                   text,
  closed_at                 timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index reportable_incidents_client_id_idx on public.reportable_incidents (client_id);
create index reportable_incidents_status_idx on public.reportable_incidents (status);

create trigger reportable_incidents_set_organisation_id
  before insert on public.reportable_incidents
  for each row execute function public.set_organisation_id();

create trigger reportable_incidents_set_updated_at
  before update on public.reportable_incidents
  for each row execute function public.set_updated_at();

alter table public.reportable_incidents enable row level security;

-- Frontline workers are very often the ones present when something
-- happens, so any internal role can lodge a report. Browsing the wider
-- register (patterns, other people's reports) is a coordination/
-- governance function — care_advocacy, committee, and admin.
create policy reportable_incidents_select on public.reportable_incidents
  for select using (
    organisation_id = public.current_org()
    and (
      public.has_role(array['admin', 'care_advocacy', 'committee'])
      or reported_by = auth.uid()
    )
  );

create policy reportable_incidents_insert on public.reportable_incidents
  for insert with check (
    organisation_id = public.current_org() and reported_by = auth.uid()
  );

create policy reportable_incidents_update on public.reportable_incidents
  for update using (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy'])
  );

create policy reportable_incidents_delete on public.reportable_incidents
  for delete using (organisation_id = public.current_org() and public.is_admin());

-- Risk register: board/governance-level document.
create type public.risk_category as enum (
  'operational', 'financial', 'compliance', 'whs', 'clinical', 'reputational', 'other'
);

create type public.risk_level as enum ('low', 'medium', 'high', 'critical');

create type public.risk_status as enum ('open', 'monitoring', 'mitigated', 'closed');

create table public.risk_register (
  id                uuid primary key default gen_random_uuid(),
  organisation_id   uuid not null references public.organisations(id),
  title             text not null,
  description       text,
  category          public.risk_category not null,
  likelihood        public.risk_level not null,
  impact            public.risk_level not null,
  mitigation        text,
  owner_id          uuid references public.profiles(id),
  status            public.risk_status not null default 'open',
  identified_date   date not null default current_date,
  review_date       date,
  last_reviewed_at  timestamptz,
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index risk_register_status_idx on public.risk_register (status);

create trigger risk_register_set_organisation_id
  before insert on public.risk_register
  for each row execute function public.set_organisation_id();

create trigger risk_register_set_updated_at
  before update on public.risk_register
  for each row execute function public.set_updated_at();

alter table public.risk_register enable row level security;

create policy risk_register_select on public.risk_register
  for select using (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy', 'committee'])
  );

-- Note: insert/update only, deliberately not "for all" — delete is a
-- separate, more restrictive policy below (a permissive "for all" policy
-- would otherwise OR its USING clause into the delete check too).
create policy risk_register_insert on public.risk_register
  for insert with check (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy', 'committee'])
  );

create policy risk_register_update on public.risk_register
  for update using (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy', 'committee'])
  );

create policy risk_register_delete on public.risk_register
  for delete using (organisation_id = public.current_org() and public.is_admin());
