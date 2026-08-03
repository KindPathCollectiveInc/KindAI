-- Organisations and profiles.

create table public.organisations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.organisations is
  'Tenant root. Only one row is expected at launch; the schema is
   multi-org-ready for the day a second NFP wants to run on the same
   platform, but nothing today assumes more than one row exists.';

create trigger organisations_set_updated_at
  before update on public.organisations
  for each row execute function public.set_updated_at();

-- 'specialist' covers contracted external practitioners (behaviour
-- support practitioner, clinical supervisor, prescriber/pharmacist,
-- etc). They do not get standing access to anything by role alone —
-- see specialist_engagements in a later migration, which works like a
-- referral: it names a specific person, a specific client, a specific
-- specialty, and a time window, and only within that window can they
-- act on the compartmentalised modules that require their sign-off
-- (restrictive practices, clinical supervision, S8/restricted
-- medication authorisation).
create type public.profile_role as enum (
  'admin', 'care_advocacy', 'committee', 'contractor', 'specialist'
);

create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id),
  full_name       text not null,
  email           text not null,
  role            public.profile_role not null default 'contractor',
  is_treasurer    boolean not null default false,
  phone           text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on column public.profiles.role is
  'New signups default to the lowest-privilege role (contractor). An
   admin must explicitly promote a person to admin/care_advocacy/committee
   — see handle_new_user() below and the setup instructions in README.md
   for how to promote the very first admin account.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-provision a profile row whenever a new Supabase Auth user signs up.
-- Single-org launch assumption: attaches the new profile to whichever
-- organisation row was created first. If a second organisation is ever
-- introduced, this trigger must be replaced with an invitation-token flow
-- that carries the target organisation_id explicitly.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org uuid;
begin
  select id into target_org from public.organisations order by created_at asc limit 1;

  insert into public.profiles (id, organisation_id, full_name, email, role)
  values (
    new.id,
    target_org,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    'contractor'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.organisations enable row level security;
alter table public.profiles enable row level security;

-- Organisations: any member of the org can see their own org row.
-- Only admins can rename it / change settings.
create policy organisations_select on public.organisations
  for select using (id = public.current_org());

create policy organisations_update on public.organisations
  for update using (id = public.current_org() and public.is_admin());

-- Profiles: any authenticated member of an org can see co-workers in the
-- same org (needed for assignee pickers, rosters, tagging, etc).
create policy profiles_select on public.profiles
  for select using (organisation_id = public.current_org());

-- A person may update a narrow set of their own fields (name/phone);
-- role and is_treasurer changes are admin-only. Enforced by splitting
-- into two policies plus a column-level check is awkward in plain RLS, so
-- we allow self-update of the row and additionally require that role and
-- is_treasurer are unchanged unless the caller is an admin, via the CHECK.
create policy profiles_update_self on public.profiles
  for update
  using (id = auth.uid() or public.is_admin())
  with check (
    organisation_id = public.current_org()
    and (
      public.is_admin()
      or (role = (select role from public.profiles p where p.id = profiles.id)
          and is_treasurer = (select is_treasurer from public.profiles p where p.id = profiles.id))
    )
  );

create policy profiles_insert_admin on public.profiles
  for insert with check (public.is_admin() and organisation_id = public.current_org());

create policy profiles_delete_admin on public.profiles
  for delete using (public.is_admin() and organisation_id = public.current_org());
