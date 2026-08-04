-- Per-plan risk rating (driving review frequency) and the org-editable
-- cadence lookup that turns a tier into an actual review interval.
--
-- specialist_plan_risk_ratings is append-only by design — each new
-- rating is a new row, never an edit to a previous one. That's what
-- makes "learn from the process each time, in a tracked and measurable
-- way" possible: the full history of suggested-vs-overridden tiers for
-- a plan is the evidence trail a review is supposed to reason from, not
-- just today's snapshot.

create table public.review_cadence_rules (
  id                uuid primary key default gen_random_uuid(),
  organisation_id   uuid not null references public.organisations(id),
  tier              public.risk_level not null,
  interval_months   integer not null check (interval_months > 0 and interval_months <= 12),
  updated_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organisation_id, tier)
);

comment on table public.review_cadence_rules is
  'Org-editable policy, not hardcoded logic — 12 months is enforced as
   the ceiling (interval_months <= 12) because low risk was set as the
   floor cadence in scoping; everything above low must review at least
   annually. Seeded with KindPath''s initial mapping in supabase/seed.sql.';

create trigger review_cadence_rules_set_organisation_id
  before insert on public.review_cadence_rules
  for each row execute function public.set_organisation_id();

create trigger review_cadence_rules_set_updated_at
  before update on public.review_cadence_rules
  for each row execute function public.set_updated_at();

alter table public.review_cadence_rules enable row level security;

create policy review_cadence_rules_select on public.review_cadence_rules
  for select using (organisation_id = public.current_org());

create policy review_cadence_rules_insert on public.review_cadence_rules
  for insert with check (organisation_id = public.current_org() and public.is_admin());

create policy review_cadence_rules_update on public.review_cadence_rules
  for update using (organisation_id = public.current_org() and public.is_admin());

create policy review_cadence_rules_delete on public.review_cadence_rules
  for delete using (organisation_id = public.current_org() and public.is_admin());

create trigger review_cadence_rules_audit
  after insert or update or delete on public.review_cadence_rules
  for each row execute function public.log_audit();

create type public.risk_tier_source as enum ('suggested', 'clinical_override');

create table public.specialist_plan_risk_ratings (
  id                       uuid primary key default gen_random_uuid(),
  organisation_id          uuid not null references public.organisations(id),
  specialist_plan_id       uuid not null references public.specialist_plans(id) on delete cascade,
  tier                     public.risk_level not null,
  suggested_tier           public.risk_level,
  source                   public.risk_tier_source not null default 'suggested',
  rationale                text,
  incident_window_months   integer not null default 6,
  effective_from           date not null default current_date,
  set_by                   uuid references public.profiles(id),
  created_at               timestamptz not null default now(),
  constraint specialist_plan_risk_ratings_override_needs_rationale check (
    source = 'suggested' or (rationale is not null and length(trim(rationale)) > 0)
  )
);

create index specialist_plan_risk_ratings_plan_idx
  on public.specialist_plan_risk_ratings (specialist_plan_id, effective_from desc, created_at desc);

create trigger specialist_plan_risk_ratings_set_organisation_id
  before insert on public.specialist_plan_risk_ratings
  for each row execute function public.set_organisation_id();

alter table public.specialist_plan_risk_ratings enable row level security;

-- Same visibility as the plan's formulation layer — a risk rating and
-- its rationale are exactly the kind of clinical judgement call this
-- module exists to protect, not blanket-visible operational detail.
create policy specialist_plan_risk_ratings_select on public.specialist_plan_risk_ratings
  for select using (
    organisation_id = public.current_org()
    and public.can_access_formulation(specialist_plan_id)
  );

create policy specialist_plan_risk_ratings_insert on public.specialist_plan_risk_ratings
  for insert with check (
    organisation_id = public.current_org()
    and (public.is_admin() or public.can_access_formulation(specialist_plan_id))
    and set_by = auth.uid()
  );

-- No update policy: ratings are append-only. Corrections are a new row,
-- not an edit — see the file header. No delete policy either, for the
-- same reason: goes through the deletion_requests gate (see
-- 20260803000017_deletion_requests.sql) rather than a raw admin DELETE.

create trigger specialist_plan_risk_ratings_audit
  after insert or update or delete on public.specialist_plan_risk_ratings
  for each row execute function public.log_audit();

-- current_risk_tier(): the most recently effective rating for a plan.
create or replace function public.current_risk_tier(target_plan uuid)
returns public.risk_level
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tier public.risk_level;
begin
  select tier into v_tier
  from public.specialist_plan_risk_ratings
  where specialist_plan_id = target_plan
  order by effective_from desc, created_at desc
  limit 1;

  return v_tier;
end;
$$;
