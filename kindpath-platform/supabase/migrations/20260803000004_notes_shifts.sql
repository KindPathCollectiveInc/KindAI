-- Case notes and shift roster — both feed the Client Hub activity feed.

create table public.notes (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id),
  client_id        uuid not null references public.clients(id) on delete cascade,
  author_id        uuid not null references public.profiles(id),
  date             date not null default current_date,
  text             text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index notes_client_id_idx on public.notes (client_id, date desc);

create trigger notes_set_organisation_id
  before insert on public.notes
  for each row execute function public.set_organisation_id();

create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

alter table public.notes enable row level security;

create policy notes_select on public.notes
  for select using (
    organisation_id = public.current_org() and public.can_access_client(client_id)
  );

-- Any internal role can write a case note (frontline support workers are
-- often the ones with eyes on the participant); editing/deleting someone
-- else's note is restricted so the audit trail stays trustworthy.
create policy notes_insert on public.notes
  for insert with check (
    organisation_id = public.current_org() and author_id = auth.uid()
  );

create policy notes_update on public.notes
  for update using (
    organisation_id = public.current_org()
    and (author_id = auth.uid() or public.has_role(array['admin', 'care_advocacy']))
  );

create policy notes_delete on public.notes
  for delete using (organisation_id = public.current_org() and public.is_admin());

create type public.shift_status as enum ('scheduled', 'completed', 'cancelled');

create table public.shifts (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id),
  client_id        uuid not null references public.clients(id) on delete cascade,
  staff_id         uuid not null references public.profiles(id),
  date             date not null,
  start_time       time,
  end_time         time,
  status           public.shift_status not null default 'scheduled',
  notes            text,
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index shifts_client_id_idx on public.shifts (client_id, date desc);
create index shifts_staff_id_idx on public.shifts (staff_id, date desc);

create trigger shifts_set_organisation_id
  before insert on public.shifts
  for each row execute function public.set_organisation_id();

create trigger shifts_set_updated_at
  before update on public.shifts
  for each row execute function public.set_updated_at();

alter table public.shifts enable row level security;

-- Contractors see only their own rostered shifts (not a colleague's
-- schedule against the same client) — compartmentalisation applies
-- between support workers, not just between roles.
create policy shifts_select on public.shifts
  for select using (
    organisation_id = public.current_org()
    and (
      public.has_role(array['admin', 'care_advocacy', 'committee'])
      or staff_id = auth.uid()
    )
  );

-- Rostering (creating/reassigning shifts) is a coordination function;
-- the assigned worker can additionally update their own shift (mark
-- complete, add shift notes) without needing roster-manager rights.
create policy shifts_insert on public.shifts
  for insert with check (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy', 'committee'])
  );

create policy shifts_update on public.shifts
  for update using (
    organisation_id = public.current_org()
    and (staff_id = auth.uid() or public.has_role(array['admin', 'care_advocacy', 'committee']))
  );

create policy shifts_delete on public.shifts
  for delete using (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy', 'committee'])
  );
