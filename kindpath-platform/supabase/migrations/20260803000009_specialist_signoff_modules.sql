-- Specialist-gated modules: a profession-mapped plan taxonomy, and
-- clinical supervision.
--
-- These are deliberately built as containers + plumbing, not clinical
-- decision tools: KindPath staff record the operational detail, but the
-- actual authorisation/sign-off can only be performed by a contracted
-- specialist who has an active, time-boxed engagement for that specific
-- client and specialty — modelled on a referral, not a login-wide grant.
--
-- Consistent with the brief's explicit exclusion of a point-of-care
-- Shift Companion app carrying live BSP/medication/risk data, this
-- coordination platform does NOT expose the formulation layer of these
-- plans to contractors (frontline workers) — that remains scoped to the
-- dedicated, security-reviewed point-of-care build called out in the
-- roadmap. Contractors do get the operational layer for clients they're
-- rostered to — see the operational/formulation split below.

-- specialty: the professions who author/authorise these plans. This is
-- deliberately a profession taxonomy, not just "specialist" — different
-- plan types belong to different professions (a GP does not authorise a
-- Behaviour Support Plan; a Behaviour Support Practitioner does not
-- authorise S8 medication).
create type public.specialty as enum (
  'behaviour_support_practitioner',
  'gp',
  'psychiatrist',
  'speech_pathologist',
  'dietician',
  'physiotherapist',
  'occupational_therapist',
  'clinical_supervisor',
  'other'
);

create type public.engagement_status as enum ('active', 'ended');

create table public.specialist_engagements (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id),
  specialist_id    uuid not null references public.profiles(id),
  client_id        uuid not null references public.clients(id) on delete cascade,
  specialty        public.specialty not null,
  start_date       date not null default current_date,
  end_date         date,
  status           public.engagement_status not null default 'active',
  referral_notes   text,
  authorised_by    uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create index specialist_engagements_specialist_idx
  on public.specialist_engagements (specialist_id, client_id, specialty);

create trigger specialist_engagements_set_organisation_id
  before insert on public.specialist_engagements
  for each row execute function public.set_organisation_id();

create trigger specialist_engagements_set_updated_at
  before update on public.specialist_engagements
  for each row execute function public.set_updated_at();

alter table public.specialist_engagements enable row level security;

create policy specialist_engagements_select on public.specialist_engagements
  for select using (
    organisation_id = public.current_org()
    and (
      public.has_role(array['admin', 'care_advocacy'])
      or specialist_id = auth.uid()
    )
  );

create policy specialist_engagements_write on public.specialist_engagements
  for insert with check (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy'])
  );

create policy specialist_engagements_update on public.specialist_engagements
  for update using (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy'])
  );

-- No delete policy: an engagement record is evidence of who was
-- authorised for what, and goes through the deletion_requests gate (see
-- 20260803000017_deletion_requests.sql) — use status = 'ended' for the
-- ordinary case of an engagement finishing.

-- specialist_engaged(): true if the calling user has a currently-active
-- engagement for this client, in this specialty, today.
create or replace function public.specialist_engaged(target_client uuid, target_specialty public.specialty)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return exists (
    select 1 from public.specialist_engagements se
    where se.client_id = target_client
      and se.specialist_id = auth.uid()
      and se.specialty = target_specialty
      and se.status = 'active'
      and se.start_date <= current_date
      and (se.end_date is null or se.end_date >= current_date)
  );
end;
$$;

-- plan_types: the taxonomy of specialist-authored plans, each mapped to
-- the profession responsible for it. Org-editable reference data (not a
-- hardcoded enum) because "no two situations are the same" and this
-- list will grow — adding a plan type is a data row, not a migration.
-- Seeded with KindPath's initial list in supabase/seed.sql.
create table public.plan_types (
  id                    uuid primary key default gen_random_uuid(),
  organisation_id       uuid not null references public.organisations(id),
  code                  text not null,
  name                  text not null,
  responsible_specialty public.specialty not null,
  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organisation_id, code)
);

create trigger plan_types_set_organisation_id
  before insert on public.plan_types
  for each row execute function public.set_organisation_id();

create trigger plan_types_set_updated_at
  before update on public.plan_types
  for each row execute function public.set_updated_at();

alter table public.plan_types enable row level security;

-- Everyone internal can see the taxonomy (it's just a reference list,
-- not participant data); only admin/care_advocacy maintain it.
create policy plan_types_select on public.plan_types
  for select using (organisation_id = public.current_org());

create policy plan_types_insert on public.plan_types
  for insert with check (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy'])
  );

create policy plan_types_update on public.plan_types
  for update using (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy'])
  );

create policy plan_types_delete on public.plan_types
  for delete using (organisation_id = public.current_org() and public.is_admin());

create type public.signoff_status as enum (
  'draft', 'pending_authorisation', 'authorised', 'declined', 'expired'
);

-- specialist_plans: the operational layer. What to do, what to avoid,
-- who to call — the safety-critical summary anyone rostered to this
-- client needs, regardless of whether they're cleared to see the
-- clinical reasoning behind it. Visible per the same compartmentalised
-- rule as the client record itself (can_access_client()) rather than
-- gated to the specialist, because withholding operational safety
-- information from the person actually delivering the shift is its own,
-- more acute, liability exposure.
--
-- `details` is a small jsonb bag for the handful of fields that vary by
-- plan type (dosage/storage for a medication plan, texture level for a
-- swallowing plan, etc) so the taxonomy can grow without a new table per
-- plan type — the universal fields (who, what client, what status, what
-- review cadence) stay real columns.
create table public.specialist_plans (
  id                  uuid primary key default gen_random_uuid(),
  organisation_id     uuid not null references public.organisations(id),
  client_id           uuid not null references public.clients(id) on delete cascade,
  plan_type_id        uuid not null references public.plan_types(id),
  operational_summary text not null,
  details             jsonb not null default '{}'::jsonb,
  status              public.signoff_status not null default 'draft',
  authorised_by       uuid references public.profiles(id),
  authorised_at       timestamptz,
  expiry_date         date,
  created_by          uuid references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on column public.specialist_plans.operational_summary is
  'The safety-operational layer only — what to do, what to avoid, who to
   call. Not the clinical formulation/rationale; that lives in
   specialist_plan_formulations, gated separately. See SECURITY.md.';

create index specialist_plans_client_id_idx on public.specialist_plans (client_id);
create index specialist_plans_plan_type_id_idx on public.specialist_plans (plan_type_id);

create trigger specialist_plans_set_organisation_id
  before insert on public.specialist_plans
  for each row execute function public.set_organisation_id();

create trigger specialist_plans_set_updated_at
  before update on public.specialist_plans
  for each row execute function public.set_updated_at();

alter table public.specialist_plans enable row level security;

create policy specialist_plans_select on public.specialist_plans
  for select using (
    organisation_id = public.current_org() and public.can_access_client(client_id)
  );

create policy specialist_plans_insert on public.specialist_plans
  for insert with check (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy'])
  );

-- Care coordinators can edit the operational description; moving into
-- pending_authorisation/authorised/declined is reserved for the
-- specialist actually engaged for this client under this plan type's
-- responsible specialty, or an admin correcting a data-entry mistake.
-- RLS can't distinguish "correcting a typo" from "overriding a clinical
-- decision" — that boundary is a process control the org's adopted
-- policy must enforce, not something the database can prove.
create policy specialist_plans_update on public.specialist_plans
  for update using (
    organisation_id = public.current_org()
    and (
      public.has_role(array['admin', 'care_advocacy'])
      or exists (
        select 1 from public.plan_types pt
        where pt.id = plan_type_id
          and public.specialist_engaged(client_id, pt.responsible_specialty)
      )
    )
  );

-- No delete policy: goes through the deletion_requests gate (see
-- 20260803000017_deletion_requests.sql).

-- specialist_plan_formulations: the formulation layer, 1:1 with
-- specialist_plans. Clinical reasoning, historical detail, diagnostic
-- content — the part that can shape a new worker's perception of a
-- participant before they've even met them, and the part that "identity
-- lock" is made of if nobody ever revisits it. Visible only to the
-- engaged specialist for this plan's responsible profession, an admin,
-- or someone holding a specific, justified, time-boxed access_grant
-- (see the next migration) — deliberately NOT a blanket
-- admin/care_advocacy default, because "elevated privileges... given on
-- a thoroughly scoped, justified and systematised implementation plan"
-- was the explicit design brief for this layer. care_advocacy manages
-- the plan administratively (via specialist_plans above) without
-- standing access to why it exists.
-- id (not specialist_plan_id) is the primary key, even though this is a
-- 1:1 table, so the generic log_audit() trigger — which assumes every
-- audited table has an `id` column — works here like everywhere else.
create table public.specialist_plan_formulations (
  id                  uuid primary key default gen_random_uuid(),
  specialist_plan_id  uuid not null unique references public.specialist_plans(id) on delete cascade,
  organisation_id     uuid not null references public.organisations(id),
  formulation_detail  text not null,
  created_by          uuid references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger specialist_plan_formulations_set_organisation_id
  before insert on public.specialist_plan_formulations
  for each row execute function public.set_organisation_id();

create trigger specialist_plan_formulations_set_updated_at
  before update on public.specialist_plan_formulations
  for each row execute function public.set_updated_at();

alter table public.specialist_plan_formulations enable row level security;

create or replace function public.can_access_formulation(target_plan uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_client_id uuid;
  v_specialty public.specialty;
begin
  if public.is_admin() then
    return true;
  end if;

  select sp.client_id, pt.responsible_specialty into v_client_id, v_specialty
  from public.specialist_plans sp
  join public.plan_types pt on pt.id = sp.plan_type_id
  where sp.id = target_plan;

  if v_client_id is null then
    return false;
  end if;

  return
    public.specialist_engaged(v_client_id, v_specialty)
    or exists (
      select 1 from public.access_grants ag
      where ag.grantee_id = auth.uid()
        and ag.revoked = false
        and (ag.expires_at is null or ag.expires_at > now())
        and (
          ag.specialist_plan_id = target_plan
          or (ag.client_id = v_client_id and ag.scope_type = 'client_formulation_all')
          or (ag.plan_type_id = (select plan_type_id from public.specialist_plans where id = target_plan)
              and ag.scope_type = 'plan_type')
        )
    );
end;
$$;

comment on function public.can_access_formulation is
  'Forward-references public.access_grants, created in the next
   migration — safe for the same reason set_organisation_id can
   forward-reference public.shifts (see 20260803000001''s file header).';

create policy specialist_plan_formulations_select on public.specialist_plan_formulations
  for select using (
    organisation_id = public.current_org()
    and public.can_access_formulation(specialist_plan_id)
  );

create policy specialist_plan_formulations_insert on public.specialist_plan_formulations
  for insert with check (
    organisation_id = public.current_org()
    and (
      public.is_admin()
      or exists (
        select 1 from public.specialist_plans sp
        join public.plan_types pt on pt.id = sp.plan_type_id
        where sp.id = specialist_plan_id
          and public.specialist_engaged(sp.client_id, pt.responsible_specialty)
      )
    )
  );

create policy specialist_plan_formulations_update on public.specialist_plan_formulations
  for update using (
    organisation_id = public.current_org()
    and public.can_access_formulation(specialist_plan_id)
  );

-- No delete policy: this is exactly the record "identity lock" is made
-- of — it must go through the deletion_requests gate (see
-- 20260803000017_deletion_requests.sql), never a raw admin DELETE.

-- Clinical supervision sessions — about a staff member's own practice,
-- not a participant's care, so the operational/formulation split above
-- doesn't apply here.
create table public.clinical_supervision_sessions (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id),
  staff_id         uuid not null references public.profiles(id),
  supervisor_id    uuid not null references public.profiles(id),
  session_date     date not null default current_date,
  summary          text,
  action_items     text,
  signed_off       boolean not null default false,
  signed_off_at    timestamptz,
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index clinical_supervision_staff_id_idx on public.clinical_supervision_sessions (staff_id);

create trigger clinical_supervision_set_organisation_id
  before insert on public.clinical_supervision_sessions
  for each row execute function public.set_organisation_id();

create trigger clinical_supervision_set_updated_at
  before update on public.clinical_supervision_sessions
  for each row execute function public.set_updated_at();

alter table public.clinical_supervision_sessions enable row level security;

-- A supervision record is visible to the staff member it's about, the
-- supervisor who ran it, and admin/care_advocacy for workforce oversight
-- — not to committee or unrelated contractors.
create policy clinical_supervision_select on public.clinical_supervision_sessions
  for select using (
    organisation_id = public.current_org()
    and (
      public.has_role(array['admin', 'care_advocacy'])
      or staff_id = auth.uid()
      or supervisor_id = auth.uid()
    )
  );

create policy clinical_supervision_insert on public.clinical_supervision_sessions
  for insert with check (
    organisation_id = public.current_org()
    and (public.has_role(array['admin', 'care_advocacy']) or supervisor_id = auth.uid())
  );

create policy clinical_supervision_update on public.clinical_supervision_sessions
  for update using (
    organisation_id = public.current_org()
    and (public.has_role(array['admin', 'care_advocacy']) or supervisor_id = auth.uid())
  );

create policy clinical_supervision_delete on public.clinical_supervision_sessions
  for delete using (organisation_id = public.current_org() and public.is_admin());
