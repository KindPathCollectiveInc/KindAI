-- Generic audit trail. Every table that holds meaningful change history
-- gets this trigger — "who changed what, when" is a stated design
-- requirement (accountability/liability protection), not optional.

create type public.audit_action as enum ('insert', 'update', 'delete');

create table public.audit_log (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id),
  table_name       text not null,
  record_id        uuid not null,
  action           public.audit_action not null,
  actor_id         uuid references public.profiles(id),
  old_data         jsonb,
  new_data         jsonb,
  created_at       timestamptz not null default now()
);

create index audit_log_record_idx on public.audit_log (table_name, record_id);
create index audit_log_organisation_id_idx on public.audit_log (organisation_id, created_at desc);

alter table public.audit_log enable row level security;

-- Read-only, and admin-only: the point of an audit trail is that
-- ordinary users (including the ones whose actions it records) cannot
-- edit or hide it. There is deliberately no insert/update/delete policy
-- for the `authenticated` role — every row is written by the
-- SECURITY DEFINER trigger below, which runs as the migration owner and
-- so is not itself subject to these policies.
create policy audit_log_select on public.audit_log
  for select using (organisation_id = public.current_org() and public.is_admin());

create or replace function public.log_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_record_id uuid;
begin
  if tg_op = 'DELETE' then
    v_org := old.organisation_id;
    v_record_id := old.id;
  else
    v_org := new.organisation_id;
    v_record_id := new.id;
  end if;

  insert into public.audit_log (organisation_id, table_name, record_id, action, actor_id, old_data, new_data)
  values (
    v_org,
    tg_table_name,
    v_record_id,
    lower(tg_op)::public.audit_action,
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) else null end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  audited_tables text[] := array[
    'profiles', 'clients', 'notes', 'shifts', 'tasks', 'events', 'messages',
    'documents', 'transactions', 'onboarding_records', 'consent_records',
    'share_tokens', 'reportable_incidents', 'risk_register',
    'specialist_engagements', 'restrictive_practices',
    'clinical_supervision_sessions', 'medication_authorisations',
    'chemical_register', 'complaints_register', 'service_agreements'
  ];
  t text;
begin
  foreach t in array audited_tables loop
    execute format(
      'create trigger %I_audit after insert or update or delete on public.%I
       for each row execute function public.log_audit();',
      t, t
    );
  end loop;
end;
$$;
