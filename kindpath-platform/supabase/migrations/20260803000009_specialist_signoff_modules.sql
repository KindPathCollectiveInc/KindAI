-- Specialist-gated modules: restrictive practices, clinical supervision,
-- and restricted/S8 medication authorisation.
--
-- These are deliberately built as containers + plumbing, not clinical
-- decision tools: KindPath staff record the operational detail, but the
-- actual authorisation/sign-off can only be performed by a contracted
-- specialist who has an active, time-boxed engagement for that specific
-- client and specialty — modelled on a referral, not a login-wide grant.
--
-- Consistent with the brief's explicit exclusion of a point-of-care
-- Shift Companion app carrying live BSP/medication/risk data, this
-- coordination platform does NOT expose restrictive-practice or
-- medication-authorisation detail to contractors (frontline workers) —
-- that remains scoped to the dedicated, security-reviewed point-of-care
-- build called out in the roadmap.

create type public.specialty as enum (
  'behaviour_support', 'clinical_supervision', 'medication_authorisation', 'other'
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

create policy specialist_engagements_delete on public.specialist_engagements
  for delete using (organisation_id = public.current_org() and public.is_admin());

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

create type public.signoff_status as enum (
  'draft', 'pending_authorisation', 'authorised', 'declined', 'expired'
);

create table public.restrictive_practices (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id),
  client_id        uuid not null references public.clients(id) on delete cascade,
  practice_type    text not null,
  description      text not null,
  rationale        text,
  status           public.signoff_status not null default 'draft',
  authorised_by    uuid references public.profiles(id),
  authorised_at    timestamptz,
  review_date      date,
  expiry_date      date,
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.restrictive_practices is
  'Distinct from the BSP/Risk Plan *document* category in the documents
   table — this is the structured authorisation record. In practice a
   BSP document and a restrictive_practices row for the same client will
   usually accompany each other.';

create index restrictive_practices_client_id_idx on public.restrictive_practices (client_id);

create trigger restrictive_practices_set_organisation_id
  before insert on public.restrictive_practices
  for each row execute function public.set_organisation_id();

create trigger restrictive_practices_set_updated_at
  before update on public.restrictive_practices
  for each row execute function public.set_updated_at();

alter table public.restrictive_practices enable row level security;

create policy restrictive_practices_select on public.restrictive_practices
  for select using (
    organisation_id = public.current_org()
    and (
      public.has_role(array['admin', 'care_advocacy'])
      or public.specialist_engaged(client_id, 'behaviour_support')
    )
  );

create policy restrictive_practices_insert on public.restrictive_practices
  for insert with check (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy'])
  );

-- Care coordinators can edit the operational description while still in
-- draft; moving into pending_authorisation/authorised/declined is a
-- clinical decision reserved for the specialist actually engaged for
-- this client's behaviour support, or an admin correcting a data-entry
-- mistake. RLS can't distinguish "correcting a typo" from "overriding a
-- clinical decision" — that boundary is a process control the org's
-- adopted policy must enforce, not something the database can prove.
create policy restrictive_practices_update on public.restrictive_practices
  for update using (
    organisation_id = public.current_org()
    and (
      public.has_role(array['admin', 'care_advocacy'])
      or public.specialist_engaged(client_id, 'behaviour_support')
    )
  );

create policy restrictive_practices_delete on public.restrictive_practices
  for delete using (organisation_id = public.current_org() and public.is_admin());

-- Clinical supervision sessions.
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

-- Restricted (S8/S4D-class) medication authorisation register. The
-- prescriber is very often external and never logs into this platform
-- at all (prescriber_name is free text, like consent_records.contact_name)
-- — authorised_by is only populated when the org has that prescriber/
-- pharmacist on as an onboarded 'specialist' profile with an active
-- medication_authorisation engagement.
create table public.medication_authorisations (
  id                    uuid primary key default gen_random_uuid(),
  organisation_id       uuid not null references public.organisations(id),
  client_id             uuid not null references public.clients(id) on delete cascade,
  medication_name       text not null,
  schedule              text,
  prescriber_name       text,
  dosage_instructions   text,
  storage_location      text,
  status                public.signoff_status not null default 'draft',
  authorised_by         uuid references public.profiles(id),
  authorised_at         timestamptz,
  review_date           date,
  created_by            uuid references public.profiles(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index medication_authorisations_client_id_idx on public.medication_authorisations (client_id);

create trigger medication_authorisations_set_organisation_id
  before insert on public.medication_authorisations
  for each row execute function public.set_organisation_id();

create trigger medication_authorisations_set_updated_at
  before update on public.medication_authorisations
  for each row execute function public.set_updated_at();

alter table public.medication_authorisations enable row level security;

create policy medication_authorisations_select on public.medication_authorisations
  for select using (
    organisation_id = public.current_org()
    and (
      public.has_role(array['admin', 'care_advocacy'])
      or public.specialist_engaged(client_id, 'medication_authorisation')
    )
  );

create policy medication_authorisations_insert on public.medication_authorisations
  for insert with check (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy'])
  );

create policy medication_authorisations_update on public.medication_authorisations
  for update using (
    organisation_id = public.current_org()
    and (
      public.has_role(array['admin', 'care_advocacy'])
      or public.specialist_engaged(client_id, 'medication_authorisation')
    )
  );

create policy medication_authorisations_delete on public.medication_authorisations
  for delete using (organisation_id = public.current_org() and public.is_admin());
