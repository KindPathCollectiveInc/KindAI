-- Clients: the hub every other module hangs off.

create type public.client_status as enum ('active', 'inactive');

create table public.clients (
  id                          uuid primary key default gen_random_uuid(),
  organisation_id             uuid not null references public.organisations(id),
  name                        text not null,
  dob                         date,
  ndis_number                 text,
  plan_end_date               date,
  support_coordinator         text,
  phone                       text,
  address                     text,
  emergency_contact           text,
  care_plan                   text,
  routines                    text,
  communication_preferences   text,
  goals                       text,
  status                      public.client_status not null default 'active',
  created_by                  uuid references public.profiles(id),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index clients_organisation_id_idx on public.clients (organisation_id);
create index clients_status_idx on public.clients (status);

create trigger clients_set_organisation_id
  before insert on public.clients
  for each row execute function public.set_organisation_id();

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

alter table public.clients enable row level security;

-- Compartmentalised visibility: admin/care_advocacy coordinate across the
-- whole caseload and see every client in the org. Committee (governance)
-- deliberately does NOT get standing access to identifiable clinical
-- records — board oversight runs through the risk/incident/complaints
-- registers, not case files (see SECURITY.md). Contractors (frontline
-- support workers) only see clients they are actively rostered to,
-- via can_access_client() / contractor_can_access_client().
create policy clients_select on public.clients
  for select using (
    organisation_id = public.current_org() and public.can_access_client(id)
  );

create policy clients_insert on public.clients
  for insert with check (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy', 'committee'])
  );

create policy clients_update on public.clients
  for update using (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy', 'committee'])
  );

create policy clients_delete on public.clients
  for delete using (organisation_id = public.current_org() and public.is_admin());
