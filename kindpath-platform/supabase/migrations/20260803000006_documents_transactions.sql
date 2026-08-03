-- Documents (with approval workflow) and organisational finances.

create type public.document_category as enum (
  'care_plan',
  'bsp_risk_plan',
  'consent_form',
  'service_agreement',
  'policy',
  'correspondence',
  'other'
);

create type public.document_status as enum (
  'draft', 'pending_approval', 'approved'
);

create table public.documents (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id),
  title            text not null,
  category         public.document_category not null,
  status           public.document_status not null default 'draft',
  client_id        uuid references public.clients(id) on delete cascade,
  uploader_id      uuid not null references public.profiles(id),
  approver_id      uuid references public.profiles(id),
  notes            text,
  file_path        text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on column public.documents.category is
  'bsp_risk_plan is flagged with a visible caution banner wherever
   displayed in the UI — see components/ui/DocumentCategoryBadge.';

create index documents_client_id_idx on public.documents (client_id);

create trigger documents_set_organisation_id
  before insert on public.documents
  for each row execute function public.set_organisation_id();

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

alter table public.documents enable row level security;

-- Org-wide documents (client_id is null — policies, induction packs,
-- board papers) are visible to every internal coordination/governance
-- role. Client-linked documents follow the same compartmentalisation
-- rule as clients themselves, and committee is excluded from those.
create policy documents_select on public.documents
  for select using (
    organisation_id = public.current_org()
    and (
      (client_id is null and public.has_role(array['admin', 'care_advocacy', 'committee']))
      or (client_id is not null and public.can_access_client(client_id))
    )
  );

create policy documents_insert on public.documents
  for insert with check (
    organisation_id = public.current_org()
    and uploader_id = auth.uid()
    and (
      public.has_role(array['admin', 'care_advocacy', 'committee'])
      or (client_id is not null and public.contractor_can_access_client(client_id))
    )
  );

create policy documents_update on public.documents
  for update using (
    organisation_id = public.current_org()
    and (
      (uploader_id = auth.uid() and status = 'draft')
      or public.has_role(array['admin', 'care_advocacy'])
    )
  );

create policy documents_delete on public.documents
  for delete using (organisation_id = public.current_org() and public.is_admin());

-- Organisational finances only — explicitly out of scope for participant
-- funds/trust accounts (see SECURITY.md / README roadmap). Restricted to
-- admin and whoever holds the treasurer flag.
create type public.transaction_type as enum ('income', 'expense');

create table public.transactions (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id),
  type             public.transaction_type not null,
  category         text not null,
  amount           numeric(12, 2) not null check (amount >= 0),
  date             date not null default current_date,
  description      text,
  client_id        uuid references public.clients(id),
  staff_id         uuid references public.profiles(id),
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.transactions is
  'Organisational money only. Participant funds/NDIS plan/trust account
   management is explicitly out of scope for this build — it is legislated
   and needs dedicated compliance design and legal review before any code
   touches it. Every screen showing this table must label it clearly as
   organisational finances, not participant funds.';

create index transactions_date_idx on public.transactions (date desc);

create trigger transactions_set_organisation_id
  before insert on public.transactions
  for each row execute function public.set_organisation_id();

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

alter table public.transactions enable row level security;

create policy transactions_select on public.transactions
  for select using (organisation_id = public.current_org() and public.is_treasurer());

create policy transactions_insert on public.transactions
  for insert with check (organisation_id = public.current_org() and public.is_treasurer());

create policy transactions_update on public.transactions
  for update using (organisation_id = public.current_org() and public.is_treasurer());

create policy transactions_delete on public.transactions
  for delete using (organisation_id = public.current_org() and public.is_admin());
