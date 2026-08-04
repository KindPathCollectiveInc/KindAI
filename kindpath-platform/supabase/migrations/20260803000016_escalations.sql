-- Escalation routing flags, mirroring the existing is_treasurer pattern
-- rather than inventing a first-class "teams" concept: KindPath is a
-- small, growing org where one person may hold several of these
-- responsibilities today and a dedicated team may hold each one later.
-- The escalation logic below doesn't change either way — only who's
-- tagged what.
alter table public.profiles add column handles_risk_compliance boolean not null default false;
alter table public.profiles add column handles_participant_outcomes boolean not null default false;
alter table public.profiles add column is_ceo_escalation_point boolean not null default false;

create or replace function public.handles_risk_compliance()
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return coalesce(
    (select handles_risk_compliance from public.profiles where id = auth.uid()), false
  ) or public.is_admin();
end;
$$;

create or replace function public.handles_participant_outcomes()
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return coalesce(
    (select handles_participant_outcomes from public.profiles where id = auth.uid()), false
  ) or public.is_admin();
end;
$$;

create or replace function public.is_ceo_escalation_point()
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return coalesce(
    (select is_ceo_escalation_point from public.profiles where id = auth.uid()), false
  ) or public.is_admin();
end;
$$;

-- Escalations: a staged process, not a single notification. Groundwork
-- happens at the risk-and-compliance / participant-outcomes level, with
-- the CEO/President having visibility at every stage (via
-- escalation_updates below) rather than being pinged only once at the
-- end — final decision authority always sits with them, but the record
-- shows the whole path there.
create type public.escalation_source as enum ('plan_review', 'incident', 'risk_register', 'other');

create type public.escalation_status as enum (
  'raised', 'groundwork', 'risk_compliance_review', 'ceo_reviewed', 'resolved'
);

create table public.escalations (
  id                          uuid primary key default gen_random_uuid(),
  organisation_id             uuid not null references public.organisations(id),
  client_id                   uuid references public.clients(id),
  source                      public.escalation_source not null default 'other',
  source_review_id            uuid references public.plan_reviews(id),
  source_incident_id          uuid references public.reportable_incidents(id),
  reason                      text not null,
  status                      public.escalation_status not null default 'raised',
  raised_by                   uuid not null references public.profiles(id),
  -- Convention, not a hard constraint: these should be people holding
  -- the matching flag above, assigned by whoever triages the
  -- escalation (there may be more than one flag-holder to choose from
  -- as the org grows past today's one-or-two-people-wearing-every-hat
  -- reality).
  risk_compliance_owner       uuid references public.profiles(id),
  participant_outcomes_owner  uuid references public.profiles(id),
  ceo_id                      uuid references public.profiles(id),
  resolution                  text,
  resolved_at                 timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index escalations_status_idx on public.escalations (status);
create index escalations_client_id_idx on public.escalations (client_id);

create trigger escalations_set_organisation_id
  before insert on public.escalations
  for each row execute function public.set_organisation_id();

create trigger escalations_set_updated_at
  before update on public.escalations
  for each row execute function public.set_updated_at();

alter table public.escalations enable row level security;

create policy escalations_select on public.escalations
  for select using (
    organisation_id = public.current_org()
    and (
      public.has_role(array['admin', 'committee'])
      or raised_by = auth.uid()
      or risk_compliance_owner = auth.uid()
      or participant_outcomes_owner = auth.uid()
      or ceo_id = auth.uid()
      or public.is_ceo_escalation_point()
      or (public.has_role(array['care_advocacy']) and (client_id is null or public.can_access_client(client_id)))
    )
  );

-- Anyone internal can raise an escalation — this is a safety valve, not
-- a privileged action.
create policy escalations_insert on public.escalations
  for insert with check (organisation_id = public.current_org() and raised_by = auth.uid());

create policy escalations_update on public.escalations
  for update using (
    organisation_id = public.current_org()
    and (
      public.is_admin()
      or risk_compliance_owner = auth.uid()
      or participant_outcomes_owner = auth.uid()
      or ceo_id = auth.uid()
      or public.is_ceo_escalation_point()
    )
  );

-- No delete policy: an escalation is exactly the kind of substantial
-- record that must survive — goes through the deletion_requests gate.

create trigger escalations_audit
  after insert or update or delete on public.escalations
  for each row execute function public.log_audit();

-- The running trail — append-only, same reasoning as
-- specialist_plan_risk_ratings: this IS the "CEO linked in at all
-- stages" guarantee, so it isn't editable after the fact.
create table public.escalation_updates (
  id             uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  escalation_id  uuid not null references public.escalations(id) on delete cascade,
  author_id      uuid not null references public.profiles(id),
  stage          public.escalation_status not null,
  note           text not null,
  created_at     timestamptz not null default now()
);

create index escalation_updates_escalation_idx on public.escalation_updates (escalation_id, created_at);

create trigger escalation_updates_set_organisation_id
  before insert on public.escalation_updates
  for each row execute function public.set_organisation_id();

alter table public.escalation_updates enable row level security;

create policy escalation_updates_select on public.escalation_updates
  for select using (
    organisation_id = public.current_org()
    and exists (
      select 1 from public.escalations e
      where e.id = escalation_id
        and (
          public.has_role(array['admin', 'committee'])
          or e.raised_by = auth.uid()
          or e.risk_compliance_owner = auth.uid()
          or e.participant_outcomes_owner = auth.uid()
          or e.ceo_id = auth.uid()
          or public.is_ceo_escalation_point()
          or (public.has_role(array['care_advocacy']) and (e.client_id is null or public.can_access_client(e.client_id)))
        )
    )
  );

create policy escalation_updates_insert on public.escalation_updates
  for insert with check (
    organisation_id = public.current_org()
    and author_id = auth.uid()
    and exists (
      select 1 from public.escalations e
      where e.id = escalation_id
        and (
          public.is_admin()
          or e.risk_compliance_owner = auth.uid()
          or e.participant_outcomes_owner = auth.uid()
          or e.ceo_id = auth.uid()
          or public.is_ceo_escalation_point()
        )
    )
  );

-- No delete policy: this is the "CEO linked in at every stage" trail —
-- it must not be editable or erasable after the fact.

create trigger escalation_updates_audit
  after insert or update or delete on public.escalation_updates
  for each row execute function public.log_audit();
