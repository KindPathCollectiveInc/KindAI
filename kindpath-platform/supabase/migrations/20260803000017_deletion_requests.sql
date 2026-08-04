-- Deletion requests: the gate for "nothing substantial is deleted
-- without oversight from CEO/President." Several earlier migrations in
-- this series deliberately removed their own admin-DELETE policy and
-- left a comment pointing here — this is where that capability actually
-- lives, as a request-and-approve workflow rather than a raw DELETE
-- statement, with final approval restricted to whoever holds
-- is_ceo_escalation_point() (which, per that function's definition,
-- includes admin as a fallback — see 20260803000016_escalations.sql).
--
-- Noise (an accidental duplicate note created moments ago) doesn't come
-- through here at all — see the notes_delete_grace_window policy in
-- 20260803000004_notes_shifts.sql for that self-service path. This gate
-- is for the archive KindPath actually wants to keep.

create type public.deletable_table as enum (
  'clients',
  'notes',
  'documents',
  'transactions',
  'reportable_incidents',
  'risk_register',
  'consent_records',
  'specialist_engagements',
  'specialist_plans',
  'specialist_plan_formulations',
  'specialist_plan_risk_ratings',
  'plan_reviews',
  'plan_review_clinical_notes',
  'review_participants',
  'escalations',
  'escalation_updates',
  'complaints_register'
);

create type public.deletion_request_status as enum ('pending', 'approved', 'declined');

create table public.deletion_requests (
  id             uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  table_name     public.deletable_table not null,
  record_id      uuid not null,
  reason         text not null,
  requested_by   uuid not null references public.profiles(id),
  status         public.deletion_request_status not null default 'pending',
  decided_by     uuid references public.profiles(id),
  decided_at     timestamptz,
  decision_note  text,
  created_at     timestamptz not null default now()
);

create index deletion_requests_status_idx on public.deletion_requests (status);
create index deletion_requests_target_idx on public.deletion_requests (table_name, record_id);

create trigger deletion_requests_set_organisation_id
  before insert on public.deletion_requests
  for each row execute function public.set_organisation_id();

alter table public.deletion_requests enable row level security;

create policy deletion_requests_select on public.deletion_requests
  for select using (
    organisation_id = public.current_org()
    and (
      public.has_role(array['admin', 'committee'])
      or requested_by = auth.uid()
      or public.is_ceo_escalation_point()
      or public.handles_risk_compliance()
      or public.handles_participant_outcomes()
    )
  );

-- Anyone internal can request a deletion — a safety valve, not a
-- privileged action. Approving one is what's restricted.
create policy deletion_requests_insert on public.deletion_requests
  for insert with check (organisation_id = public.current_org() and requested_by = auth.uid());

-- Ordinary UPDATE can only decline a request or leave it pending with a
-- note — never mark it approved. 'approved' is only ever set by
-- execute_approved_deletion() below, which (as a SECURITY DEFINER
-- function) runs outside RLS, precisely so that "approved" in this
-- table can never be true without the underlying delete having actually
-- happened.
create policy deletion_requests_update on public.deletion_requests
  for update using (
    organisation_id = public.current_org() and public.is_ceo_escalation_point()
  )
  with check (
    organisation_id = public.current_org()
    and public.is_ceo_escalation_point()
    and status in ('pending', 'declined')
  );

create policy deletion_requests_delete on public.deletion_requests
  for delete using (organisation_id = public.current_org() and public.is_admin());

create trigger deletion_requests_audit
  after insert or update or delete on public.deletion_requests
  for each row execute function public.log_audit();

-- execute_approved_deletion(): the only path by which a row in any
-- `deletable_table` actually gets deleted. table_name is constrained to
-- the enum above (not arbitrary text), so the dynamic SQL below can
-- never target anything outside that fixed, reviewed list.
create or replace function public.execute_approved_deletion(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.deletion_requests%rowtype;
begin
  select * into v_request from public.deletion_requests where id = request_id;

  if not found then
    raise exception 'Deletion request % not found', request_id;
  end if;

  if v_request.organisation_id <> public.current_org() then
    raise exception 'Not authorised for this organisation';
  end if;

  if not public.is_ceo_escalation_point() then
    raise exception 'Only a CEO/President-flagged profile can approve a deletion';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Deletion request % has already been decided', request_id;
  end if;

  execute format(
    'delete from public.%I where id = $1 and organisation_id = $2',
    v_request.table_name::text
  ) using v_request.record_id, v_request.organisation_id;

  update public.deletion_requests
    set status = 'approved', decided_by = auth.uid(), decided_at = now()
    where id = request_id;
end;
$$;

grant execute on function public.execute_approved_deletion(uuid) to authenticated;
