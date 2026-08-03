-- Tasks, calendar events, and the team noticeboard, each with a tag join
-- table so an item can be tagged to a client, a person, or nothing.

create type public.task_priority as enum ('low', 'medium', 'high');
create type public.task_status as enum ('todo', 'in_progress', 'done');

create table public.tasks (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id),
  title            text not null,
  description      text,
  due_date         date,
  assignee_id      uuid references public.profiles(id),
  priority         public.task_priority not null default 'medium',
  status           public.task_status not null default 'todo',
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index tasks_assignee_id_idx on public.tasks (assignee_id, status);
create index tasks_due_date_idx on public.tasks (due_date);

create trigger tasks_set_organisation_id
  before insert on public.tasks
  for each row execute function public.set_organisation_id();

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;

create policy tasks_select on public.tasks
  for select using (organisation_id = public.current_org());

create policy tasks_insert on public.tasks
  for insert with check (
    organisation_id = public.current_org() and created_by = auth.uid()
  );

create policy tasks_update on public.tasks
  for update using (
    organisation_id = public.current_org()
    and (
      assignee_id = auth.uid()
      or created_by = auth.uid()
      or public.has_role(array['admin', 'care_advocacy', 'committee'])
    )
  );

create policy tasks_delete on public.tasks
  for delete using (
    organisation_id = public.current_org()
    and (created_by = auth.uid() or public.is_admin())
  );

create table public.task_tags (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id),
  task_id          uuid not null references public.tasks(id) on delete cascade,
  client_id        uuid references public.clients(id) on delete cascade,
  profile_id       uuid references public.profiles(id) on delete cascade,
  created_at       timestamptz not null default now(),
  constraint task_tags_exactly_one_target check (
    (client_id is not null)::int + (profile_id is not null)::int = 1
  )
);

create index task_tags_client_id_idx on public.task_tags (client_id);
create index task_tags_profile_id_idx on public.task_tags (profile_id);

create trigger task_tags_set_organisation_id
  before insert on public.task_tags
  for each row execute function public.set_organisation_id();

alter table public.task_tags enable row level security;

create policy task_tags_select on public.task_tags
  for select using (organisation_id = public.current_org());

create policy task_tags_write on public.task_tags
  for all using (organisation_id = public.current_org())
  with check (organisation_id = public.current_org());

-- Calendar events: shared events are visible org-wide; solo events are
-- private to their owner (and admins, for coverage/HR purposes).
create type public.event_visibility as enum ('shared', 'solo');

create table public.events (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id),
  title            text not null,
  description      text,
  date             date not null,
  start_time       time,
  end_time         time,
  visibility       public.event_visibility not null default 'shared',
  owner_id         uuid not null references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index events_date_idx on public.events (date);

create trigger events_set_organisation_id
  before insert on public.events
  for each row execute function public.set_organisation_id();

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

alter table public.events enable row level security;

create policy events_select on public.events
  for select using (
    organisation_id = public.current_org()
    and (visibility = 'shared' or owner_id = auth.uid() or public.is_admin())
  );

create policy events_insert on public.events
  for insert with check (
    organisation_id = public.current_org() and owner_id = auth.uid()
  );

create policy events_update on public.events
  for update using (
    organisation_id = public.current_org()
    and (owner_id = auth.uid() or public.is_admin())
  );

create policy events_delete on public.events
  for delete using (
    organisation_id = public.current_org()
    and (owner_id = auth.uid() or public.is_admin())
  );

create table public.event_tags (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id),
  event_id         uuid not null references public.events(id) on delete cascade,
  client_id        uuid references public.clients(id) on delete cascade,
  profile_id       uuid references public.profiles(id) on delete cascade,
  created_at       timestamptz not null default now(),
  constraint event_tags_exactly_one_target check (
    (client_id is not null)::int + (profile_id is not null)::int = 1
  )
);

create trigger event_tags_set_organisation_id
  before insert on public.event_tags
  for each row execute function public.set_organisation_id();

alter table public.event_tags enable row level security;

create policy event_tags_select on public.event_tags
  for select using (organisation_id = public.current_org());

create policy event_tags_write on public.event_tags
  for all using (organisation_id = public.current_org())
  with check (organisation_id = public.current_org());

-- Team messages: simple internal noticeboard, tagged to clients/people.
create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id),
  author_id        uuid not null references public.profiles(id),
  date             timestamptz not null default now(),
  text             text not null,
  created_at       timestamptz not null default now()
);

create index messages_date_idx on public.messages (date desc);

create trigger messages_set_organisation_id
  before insert on public.messages
  for each row execute function public.set_organisation_id();

alter table public.messages enable row level security;

create policy messages_select on public.messages
  for select using (organisation_id = public.current_org());

create policy messages_insert on public.messages
  for insert with check (
    organisation_id = public.current_org() and author_id = auth.uid()
  );

create policy messages_update on public.messages
  for update using (
    organisation_id = public.current_org()
    and (author_id = auth.uid() or public.is_admin())
  );

create policy messages_delete on public.messages
  for delete using (
    organisation_id = public.current_org()
    and (author_id = auth.uid() or public.is_admin())
  );

create table public.message_tags (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id),
  message_id       uuid not null references public.messages(id) on delete cascade,
  client_id        uuid references public.clients(id) on delete cascade,
  profile_id       uuid references public.profiles(id) on delete cascade,
  created_at       timestamptz not null default now(),
  constraint message_tags_exactly_one_target check (
    (client_id is not null)::int + (profile_id is not null)::int = 1
  )
);

create trigger message_tags_set_organisation_id
  before insert on public.message_tags
  for each row execute function public.set_organisation_id();

alter table public.message_tags enable row level security;

create policy message_tags_select on public.message_tags
  for select using (organisation_id = public.current_org());

create policy message_tags_write on public.message_tags
  for all using (organisation_id = public.current_org())
  with check (organisation_id = public.current_org());
