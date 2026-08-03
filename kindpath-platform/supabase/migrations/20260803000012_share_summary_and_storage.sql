-- Public Coordinated Summary RPC + Supabase Storage bucket/policies for
-- document uploads.

-- get_coordinated_summary(): the entire public, unauthenticated surface
-- of this application. It is intentionally the ONLY way an anonymous
-- caller can read anything — there is no anon SELECT grant on any table,
-- so even if this function did not exist, RLS alone already blocks
-- anonymous access (current_org() is null for a caller with no profile,
-- and every policy compares against it). This function adds the one
-- deliberate, narrow exception: a valid, unexpired, unrevoked token
-- unlocks a scope-limited read of a single client's coordinated summary
-- fields, nothing else — no notes, no documents, no financials, no
-- other client.
create or replace function public.get_coordinated_summary(p_token text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_share public.share_tokens%rowtype;
  v_client public.clients%rowtype;
  result jsonb;
begin
  select * into v_share
    from public.share_tokens st
    where st.token = p_token
      and st.revoked = false
      and (st.expires_at is null or st.expires_at > now());

  if not found then
    return null;
  end if;

  select * into v_client from public.clients c where c.id = v_share.client_id;
  if not found then
    return null;
  end if;

  result := jsonb_build_object('name', v_client.name, 'routines', v_client.routines);

  if v_share.scope in ('routines_and_comms', 'full_summary') then
    result := result || jsonb_build_object(
      'communication_preferences', v_client.communication_preferences
    );
  end if;

  if v_share.scope = 'full_summary' then
    result := result || jsonb_build_object(
      'goals', v_client.goals,
      'care_plan', v_client.care_plan
    );
  end if;

  return result;
end;
$$;

-- Callable by anon (unauthenticated) and authenticated alike — the token
-- itself is the credential.
grant execute on function public.get_coordinated_summary(text) to anon, authenticated;

-- Document storage. Path convention: {organisation_id}/{document_id}/{filename}.
-- A document's `documents` row must exist before its file is uploaded (the
-- app creates the row first, then uploads to the path derived from its id),
-- so these object policies simply defer to the documents table's own
-- access rules by joining on the path's document-id segment — the same
-- compartmentalisation applies to the file as to the row describing it.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy documents_bucket_select on storage.objects
  for select using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.documents d
      where d.id::text = (storage.foldername(name))[2]
        and d.organisation_id = public.current_org()
        and (
          (d.client_id is null and public.has_role(array['admin', 'care_advocacy', 'committee']))
          or (d.client_id is not null and public.can_access_client(d.client_id))
        )
    )
  );

create policy documents_bucket_insert on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and exists (
      select 1 from public.documents d
      where d.id::text = (storage.foldername(name))[2]
        and d.organisation_id = public.current_org()
        and (d.uploader_id = auth.uid() or public.has_role(array['admin', 'care_advocacy', 'committee']))
    )
  );

create policy documents_bucket_update on storage.objects
  for update using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.documents d
      where d.id::text = (storage.foldername(name))[2]
        and d.organisation_id = public.current_org()
        and (
          (d.uploader_id = auth.uid() and d.status = 'draft')
          or public.has_role(array['admin', 'care_advocacy'])
        )
    )
  );

create policy documents_bucket_delete on storage.objects
  for delete using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.documents d
      where d.id::text = (storage.foldername(name))[2]
        and d.organisation_id = public.current_org()
        and public.is_admin()
    )
  );
