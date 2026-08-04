-- Chemical/COSHH register, complaints & feedback register, and service
-- agreements (funding source per client) — governance/operational
-- registers for a service that sits at the convergence of premises
-- safety, statutory complaints handling, and mixed public/private
-- funding.

create table public.chemical_register (
  id                 uuid primary key default gen_random_uuid(),
  organisation_id    uuid not null references public.organisations(id),
  substance_name     text not null,
  sds_reference      text,
  location            text,
  hazard_class       text,
  control_measures   text,
  quantity            text,
  review_date        date,
  created_by         uuid references public.profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.chemical_register is
  'Premises WHS register (COSHH-style): hazardous substances held at a
   site, their Safety Data Sheet reference, and control measures.
   Site-level, not participant-level.';

create trigger chemical_register_set_organisation_id
  before insert on public.chemical_register
  for each row execute function public.set_organisation_id();

create trigger chemical_register_set_updated_at
  before update on public.chemical_register
  for each row execute function public.set_updated_at();

alter table public.chemical_register enable row level security;

-- WHS/premises safety data — visible to everyone who might need to act
-- on it (including contractors on site), maintained by coordination
-- roles.
create policy chemical_register_select on public.chemical_register
  for select using (organisation_id = public.current_org());

create policy chemical_register_insert on public.chemical_register
  for insert with check (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy', 'committee'])
  );

create policy chemical_register_update on public.chemical_register
  for update using (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy', 'committee'])
  );

create policy chemical_register_delete on public.chemical_register
  for delete using (organisation_id = public.current_org() and public.is_admin());

-- Complaints & feedback register (NDIS Commission complaints-management
-- obligation).
create type public.complaint_source as enum (
  'participant', 'family_carer', 'staff', 'external_service', 'public', 'other'
);

create type public.complaint_status as enum (
  'received', 'investigating', 'resolved', 'escalated', 'closed'
);

create table public.complaints_register (
  id                 uuid primary key default gen_random_uuid(),
  organisation_id    uuid not null references public.organisations(id),
  client_id          uuid references public.clients(id),
  source             public.complaint_source not null,
  received_date      date not null default current_date,
  summary            text not null,
  investigation_notes text,
  outcome            text,
  status             public.complaint_status not null default 'received',
  raised_with_commission boolean not null default false,
  handled_by         uuid references public.profiles(id),
  created_by         uuid references public.profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index complaints_register_client_id_idx on public.complaints_register (client_id);

create trigger complaints_register_set_organisation_id
  before insert on public.complaints_register
  for each row execute function public.set_organisation_id();

create trigger complaints_register_set_updated_at
  before update on public.complaints_register
  for each row execute function public.set_updated_at();

alter table public.complaints_register enable row level security;

-- Governance/coordination function, same shape as reportable incidents:
-- any internal role can lodge, browsing the register is admin/
-- care_advocacy/committee.
create policy complaints_register_select on public.complaints_register
  for select using (
    organisation_id = public.current_org()
    and (
      public.has_role(array['admin', 'care_advocacy', 'committee'])
      or created_by = auth.uid()
    )
  );

create policy complaints_register_insert on public.complaints_register
  for insert with check (
    organisation_id = public.current_org() and created_by = auth.uid()
  );

create policy complaints_register_update on public.complaints_register
  for update using (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy', 'committee'])
  );

-- No delete policy: a complaint record is substantial and goes through
-- the deletion_requests gate (see 20260803000017_deletion_requests.sql).

-- Service agreements: which funding source(s) a client's supports run
-- under. "Various publicly and privately funded support services"
-- means a client is not always simply "an NDIS participant" — this
-- table lets more than one funding arrangement exist per client over
-- time.
create type public.funding_source as enum (
  'ndis', 'state_program', 'private', 'other'
);

create type public.service_agreement_status as enum ('active', 'ended', 'pending');

create table public.service_agreements (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id),
  client_id        uuid not null references public.clients(id) on delete cascade,
  funding_source   public.funding_source not null,
  program_name     text,
  start_date       date not null default current_date,
  end_date         date,
  funded_hours     numeric(6, 2),
  budget_amount    numeric(12, 2),
  status           public.service_agreement_status not null default 'active',
  notes            text,
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index service_agreements_client_id_idx on public.service_agreements (client_id);

create trigger service_agreements_set_organisation_id
  before insert on public.service_agreements
  for each row execute function public.set_organisation_id();

create trigger service_agreements_set_updated_at
  before update on public.service_agreements
  for each row execute function public.set_updated_at();

alter table public.service_agreements enable row level security;

create policy service_agreements_select on public.service_agreements
  for select using (
    organisation_id = public.current_org() and public.can_access_client(client_id)
  );

create policy service_agreements_insert on public.service_agreements
  for insert with check (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy'])
  );

create policy service_agreements_update on public.service_agreements
  for update using (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy'])
  );

create policy service_agreements_delete on public.service_agreements
  for delete using (organisation_id = public.current_org() and public.is_admin());
