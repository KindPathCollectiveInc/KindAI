-- Plan reviews: the mandatory, scheduled, evidence-gated check on
-- whether a specialist plan (and any restrictive element within it) is
-- still load-bearing or has become an inert artifact of someone's past
-- — "identity lock", in KindPath's own language.
--
-- Split the same way specialist_plans is: the review record itself
-- (status, outcome, the participant's own voice, the resulting tier) is
-- visible per the normal client-compartmentalisation rule, because
-- knowing a review happened and what was decided is operationally
-- relevant. The clinical discussion detail lives in a gated companion
-- table, same boundary as the plan's formulation layer.

create type public.review_status as enum ('scheduled', 'held', 'overdue', 'cancelled');
create type public.review_outcome as enum ('continue_unchanged', 'reduce', 'eliminate', 'escalate');

create table public.plan_reviews (
  id                        uuid primary key default gen_random_uuid(),
  organisation_id           uuid not null references public.organisations(id),
  specialist_plan_id        uuid not null references public.specialist_plans(id) on delete cascade,
  client_id                 uuid not null references public.clients(id) on delete cascade,
  scheduled_date            date not null,
  held_date                 date,
  status                    public.review_status not null default 'scheduled',
  outcome                   public.review_outcome,
  -- The participant's own words about their own plan. Deliberately NOT
  -- gated behind the formulation boundary — a person's voice about their
  -- own life belongs with the people supporting them, not locked behind
  -- the same wall as clinical reasoning about them.
  participant_input         text,
  resulting_risk_rating_id  uuid references public.specialist_plan_risk_ratings(id),
  next_review_due           date,
  created_by                uuid references public.profiles(id),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- Keep client_id consistent with the plan it reviews, without relying on
-- the app to get it right on every insert.
create or replace function public.copy_client_id_from_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select client_id into new.client_id from public.specialist_plans where id = new.specialist_plan_id;
  return new;
end;
$$;

create trigger plan_reviews_copy_client_id
  before insert on public.plan_reviews
  for each row execute function public.copy_client_id_from_plan();

create trigger plan_reviews_set_organisation_id
  before insert on public.plan_reviews
  for each row execute function public.set_organisation_id();

create trigger plan_reviews_set_updated_at
  before update on public.plan_reviews
  for each row execute function public.set_updated_at();

create index plan_reviews_specialist_plan_idx on public.plan_reviews (specialist_plan_id);
create index plan_reviews_next_review_due_idx on public.plan_reviews (next_review_due) where status <> 'cancelled';

alter table public.plan_reviews enable row level security;

create policy plan_reviews_select on public.plan_reviews
  for select using (organisation_id = public.current_org() and public.can_access_client(client_id));

create policy plan_reviews_insert on public.plan_reviews
  for insert with check (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy'])
  );

create policy plan_reviews_update on public.plan_reviews
  for update using (
    organisation_id = public.current_org()
    and (
      public.has_role(array['admin', 'care_advocacy'])
      or public.can_access_formulation(specialist_plan_id)
    )
  );

-- No delete policy: a review record is exactly the evidence trail this
-- whole module exists to preserve — goes through the deletion_requests
-- gate (see 20260803000017_deletion_requests.sql).

create trigger plan_reviews_audit
  after insert or update or delete on public.plan_reviews
  for each row execute function public.log_audit();

-- The clinical discussion detail — same access boundary as the plan's
-- formulation layer (reuses can_access_formulation via the parent plan).
-- id (not review_id) is the primary key, same reasoning as
-- specialist_plan_formulations in the previous migration — log_audit()
-- assumes every audited table has an `id` column.
create table public.plan_review_clinical_notes (
  id                uuid primary key default gen_random_uuid(),
  review_id         uuid not null unique references public.plan_reviews(id) on delete cascade,
  organisation_id   uuid not null references public.organisations(id),
  clinical_summary  text not null,
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger plan_review_clinical_notes_set_organisation_id
  before insert on public.plan_review_clinical_notes
  for each row execute function public.set_organisation_id();

create trigger plan_review_clinical_notes_set_updated_at
  before update on public.plan_review_clinical_notes
  for each row execute function public.set_updated_at();

alter table public.plan_review_clinical_notes enable row level security;

create policy plan_review_clinical_notes_select on public.plan_review_clinical_notes
  for select using (
    organisation_id = public.current_org()
    and public.can_access_formulation((select specialist_plan_id from public.plan_reviews where id = review_id))
  );

create policy plan_review_clinical_notes_insert on public.plan_review_clinical_notes
  for insert with check (
    organisation_id = public.current_org()
    and public.can_access_formulation((select specialist_plan_id from public.plan_reviews where id = review_id))
  );

create policy plan_review_clinical_notes_update on public.plan_review_clinical_notes
  for update using (
    organisation_id = public.current_org()
    and public.can_access_formulation((select specialist_plan_id from public.plan_reviews where id = review_id))
  );

-- No delete policy: goes through the deletion_requests gate.

create trigger plan_review_clinical_notes_audit
  after insert or update or delete on public.plan_review_clinical_notes
  for each row execute function public.log_audit();

-- Attendance, split into the two segments discussed: who was present
-- for the participant-voice portion vs the clinical/cross-service
-- discussion portion (someone can appear in one, both, or neither).
-- Most of these people — family, advocates, community members, worker
-- representatives — will never have a login, hence external_name.
create type public.review_participant_type as enum (
  'specialist',
  'support_coordinator',
  'family',
  'advocate',
  'service_manager',
  'community_member',
  'worker_representative',
  'participant',
  'other'
);

create type public.review_segment as enum ('participant_voice', 'clinical_discussion', 'both');

create table public.review_participants (
  id                     uuid primary key default gen_random_uuid(),
  organisation_id        uuid not null references public.organisations(id),
  review_id              uuid not null references public.plan_reviews(id) on delete cascade,
  participant_type       public.review_participant_type not null,
  profile_id             uuid references public.profiles(id),
  external_name          text,
  external_relationship  text,
  attended_segment       public.review_segment not null default 'both',
  notes                  text,
  created_at             timestamptz not null default now(),
  constraint review_participants_identifies_someone check (
    profile_id is not null or external_name is not null
  )
);

create index review_participants_review_idx on public.review_participants (review_id);

create trigger review_participants_set_organisation_id
  before insert on public.review_participants
  for each row execute function public.set_organisation_id();

alter table public.review_participants enable row level security;

-- Same visibility as the review itself (who attended doesn't reveal
-- clinical reasoning content) — the client-compartmentalisation rule
-- via the parent review.
create policy review_participants_select on public.review_participants
  for select using (
    organisation_id = public.current_org()
    and public.can_access_client((select client_id from public.plan_reviews where id = review_id))
  );

create policy review_participants_insert on public.review_participants
  for insert with check (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy'])
  );

create policy review_participants_update on public.review_participants
  for update using (
    organisation_id = public.current_org()
    and public.has_role(array['admin', 'care_advocacy'])
  );

-- No delete policy: attendance is part of the review's integrity — goes
-- through the deletion_requests gate.

create trigger review_participants_audit
  after insert or update or delete on public.review_participants
  for each row execute function public.log_audit();
