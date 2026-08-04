-- access_grants: the "thoroughly scoped, justified and systematised"
-- mechanism for elevating a specific person's access to the formulation
-- layer of a specialist plan, without giving them a standing role-wide
-- grant. Modelled on the same shape as share_tokens — scoped, justified,
-- time-boxed, revocable, and every grant/revoke traceable through the
-- audit log.
--
-- Three scopes, from narrowest to broadest:
--   specific_plan          — one named plan, e.g. onboarding a new
--                             worker onto one participant's BSP rationale
--   plan_type               — every plan of one type org-wide, e.g. a
--                             newly contracted GP reviewing all Health
--                             Care Plans they're taking over
--   client_formulation_all  — every formulation for one client, e.g. a
--                             new case-carrying care coordinator

create type public.access_grant_scope as enum (
  'specific_plan', 'plan_type', 'client_formulation_all'
);

create table public.access_grants (
  id                  uuid primary key default gen_random_uuid(),
  organisation_id     uuid not null references public.organisations(id),
  grantee_id          uuid not null references public.profiles(id),
  scope_type          public.access_grant_scope not null,
  specialist_plan_id  uuid references public.specialist_plans(id) on delete cascade,
  plan_type_id        uuid references public.plan_types(id),
  client_id           uuid references public.clients(id) on delete cascade,
  justification       text not null,
  approved_by         uuid not null references public.profiles(id),
  granted_at          timestamptz not null default now(),
  review_date         date,
  expires_at          timestamptz,
  revoked             boolean not null default false,
  revoked_at          timestamptz,
  revoked_by          uuid references public.profiles(id),
  created_at          timestamptz not null default now(),
  constraint access_grants_scope_matches_target check (
    (scope_type = 'specific_plan'
      and specialist_plan_id is not null and plan_type_id is null and client_id is null)
    or (scope_type = 'plan_type'
      and plan_type_id is not null and specialist_plan_id is null and client_id is null)
    or (scope_type = 'client_formulation_all'
      and client_id is not null and specialist_plan_id is null and plan_type_id is null)
  )
);

create index access_grants_grantee_idx on public.access_grants (grantee_id);

create trigger access_grants_set_organisation_id
  before insert on public.access_grants
  for each row execute function public.set_organisation_id();

alter table public.access_grants enable row level security;

-- A person can see their own grants (so they know what they've been
-- given and why, and can point to it); managing everyone's access is a
-- coordination function.
create policy access_grants_select on public.access_grants
  for select using (
    organisation_id = public.current_org()
    and (public.has_role(array['admin', 'care_advocacy']) or grantee_id = auth.uid())
  );

create policy access_grants_insert on public.access_grants
  for insert with check (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy'])
    and approved_by = auth.uid()
  );

-- Update is for revocation (or adjusting review_date/expiry) — not for
-- silently swapping what a grant covers after the fact, which would
-- defeat the point of it being scoped and justified up front. The
-- application layer should treat scope/justification as write-once and
-- create a new grant rather than mutate an existing one's target.
create policy access_grants_update on public.access_grants
  for update using (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy'])
  );

create policy access_grants_delete on public.access_grants
  for delete using (organisation_id = public.current_org() and public.is_admin());

-- log_audit() was created in 20260803000011_audit_log.sql, before this
-- table existed — attached directly here rather than via that
-- migration's audited_tables list.
create trigger access_grants_audit
  after insert or update or delete on public.access_grants
  for each row execute function public.log_audit();
