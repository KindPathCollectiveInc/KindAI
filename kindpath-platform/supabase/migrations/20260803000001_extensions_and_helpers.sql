-- KindPath Operations Platform
-- Extensions and RLS helper functions.
--
-- Design note: every tenant-scoped table carries its own `organisation_id`
-- column rather than relying solely on joins through `clients`. This keeps
-- every RLS policy a single flat comparison instead of a correlated
-- subquery, which is both easier to audit and cheaper to evaluate. A
-- BEFORE INSERT trigger (see 20260803000002) forces that column to the
-- caller's own organisation on every insert, so a compromised or buggy
-- client can never write a row into someone else's tenant by supplying a
-- different organisation_id in the payload.
--
-- All helpers below are LANGUAGE PLPGSQL, not LANGUAGE SQL, even where a
-- single query would do. This is deliberate: plain SQL-language function
-- bodies are parse-analysed against the catalog at CREATE FUNCTION time,
-- so a SQL function defined here (before public.profiles/clients/shifts
-- exist, in later migrations) would fail to even be created. PL/pgSQL
-- function bodies are stored opaquely and only compiled on first call,
-- so they can forward-reference tables created by later migrations in
-- this same series.

create extension if not exists pgcrypto;

-- current_org(): the organisation_id of the calling user's profile.
-- SECURITY DEFINER so it can read `profiles` even from inside a policy
-- that is itself evaluating access to `profiles` (avoids RLS recursion).
create or replace function public.current_org()
returns uuid
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return (select organisation_id from public.profiles where id = auth.uid());
end;
$$;

-- current_role(): the role of the calling user's profile.
create or replace function public.current_role()
returns text
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return (select role::text from public.profiles where id = auth.uid());
end;
$$;

-- has_role(): convenience check against a set of allowed role names.
create or replace function public.has_role(allowed text[])
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return coalesce(public.current_role() = any(allowed), false);
end;
$$;

-- is_admin(): shorthand used across most write policies.
create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return public.current_role() = 'admin';
end;
$$;

-- is_treasurer(): admin, or a profile explicitly flagged as treasurer.
-- The brief's role enum (admin | care_advocacy | committee | contractor)
-- has no dedicated "treasurer" role, but financial data must be
-- "restricted to admin/treasurer-level roles". Rather than overload the
-- committee role for every committee member, we add a narrow
-- `profiles.is_treasurer` flag an admin can grant to whichever
-- committee/contractor person actually holds that responsibility.
create or replace function public.is_treasurer()
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return coalesce(
    (select is_treasurer from public.profiles where id = auth.uid()),
    false
  ) or public.is_admin();
end;
$$;

-- contractor_can_access_client(): the compartmentalisation rule for
-- frontline support workers. A contractor does not get standing access
-- to every participant in the org — only to clients they are actually
-- rostered to support, and only within an active window around that
-- rostering (default: 30 days either side of a shift date). This means
-- access tracks real engagement over time rather than accumulating into
-- a permanent caseload-wide grant, and it re-evaluates on every request
-- (nothing is cached in a JWT claim), so it responds immediately as
-- rosters change.
--
-- Forward-references public.shifts, created in a later migration — see
-- the file header note on why that's safe for PL/pgSQL.
--
-- The exact window is a judgement call pending sign-off from KindPath on
-- their actual operating model; adjust the interval below if a tighter
-- or looser window is wanted.
create or replace function public.contractor_can_access_client(target_client uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return exists (
    select 1 from public.shifts s
    where s.client_id = target_client
      and s.staff_id = auth.uid()
      and s.date between (current_date - interval '30 days') and (current_date + interval '30 days')
  );
end;
$$;

-- can_access_client(): the full visibility rule combining role + the
-- contractor compartmentalisation carve-out above. admin/care_advocacy
-- always see the whole org caseload (they coordinate/oversee care across
-- it); committee (governance) does NOT get standing clinical access —
-- see SECURITY.md for the reasoning; contractors are scoped to their
-- active roster.
create or replace function public.can_access_client(target_client uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return
    public.has_role(array['admin', 'care_advocacy'])
    or public.contractor_can_access_client(target_client);
end;
$$;

-- set_updated_at(): generic BEFORE UPDATE trigger to stamp updated_at.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- set_organisation_id(): generic BEFORE INSERT trigger that forces the
-- organisation_id column to the caller's own org, ignoring any value the
-- client may have supplied. This is a defence-in-depth measure on top of
-- RLS: even a policy bug or a service-role script run without care cannot
-- accidentally cross-write tenant data through the normal insert path.
create or replace function public.set_organisation_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.organisation_id = public.current_org();
  return new;
end;
$$;
