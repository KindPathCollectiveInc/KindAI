# KindPath Operations Platform

The KindIS platform: a real, deployable operations tool for KindPath
Collective Inc — disability advocacy and NDIS support coordination in the
Northern Rivers region. Built around one principle: **the client is the
hub**. Every module (notes, tasks, shifts, documents, transactions,
incidents, risk) references a client, and the Client Hub shows a unified,
chronological activity feed across all of them — a single source of truth
per participant, replacing disjointed spreadsheets and lost continuity of
care.

This is production software for real participant and organisational
data, not a prototype. Read [`SECURITY.md`](./SECURITY.md) before putting
real data anywhere near it — several items there need sign-off from
KindPath leadership before go-live.

## Stack

- **Frontend:** React 19 + Vite, Tailwind CSS v4, React Router
- **Backend/DB:** Supabase (Postgres + Auth + Row-Level Security)
- **Hosting:** Vercel or Netlify (frontend), Supabase managed (backend)
- **Auth:** Supabase Auth, email/password

RLS is enforced at the database level — every table's access rules live
in `supabase/migrations/`, not just hidden in the UI. See `SECURITY.md`
for the full access model (roles, compartmentalisation, specialist
sign-off gating).

## Project structure

```
src/
  features/        one folder per domain (auth, clients, people, incidents, risk-register, share)
  components/       shared UI (layout, ui primitives)
  routes/           top-level pages that aren't a single feature (dashboard)
  lib/              supabase client
  types/database.ts  hand-written types mirroring the SQL schema (see note in that file)
supabase/
  migrations/       the entire schema, in order, as plain SQL
  seed.sql          seeds the single organisation row this build assumes at launch
```

## Getting started

### 1. Create a Supabase project

Create a new project at [supabase.com](https://supabase.com). Note the
project URL and anon key from Project Settings → API.

### 2. Apply the schema

Using the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase link --project-ref <your-project-ref>
supabase db push        # applies everything in supabase/migrations/
psql "$(supabase db show-connection-string --db-url)" -f supabase/seed.sql
```

(Or paste each file in `supabase/migrations/`, in filename order, into
the Supabase SQL editor, followed by `seed.sql`.)

Every migration in this series was verified end-to-end against a real
local Postgres instance before being committed — see the "RLS testing"
section of `SECURITY.md`.

### 3. Configure the app

```bash
cp .env.example .env.local
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

### 4. Create your first admin account

Sign up through the app. New accounts default to the lowest-privilege
role (`contractor`) — this is deliberate (see `SECURITY.md`). Promote
your first account to admin directly in Supabase:

```sql
update public.profiles set role = 'admin' where email = 'you@kindpathcollective.org';
```

From there, use the People screen (once you're admin) to manage
everyone else's role.

### 5. Deploy

- **Frontend:** point Vercel or Netlify at this directory; set the same
  two `VITE_SUPABASE_*` env vars in their dashboard; build command
  `npm run build`, output directory `dist`.
- **Backend:** already deployed the moment your Supabase project exists.

## What's built vs. what's roadmap

The brief specified 11 modules, in a deliberate build order. This pass
delivers the first milestone plus the additional compliance modules
requested during scoping (incidents, risk register, and the
specialist-gated modules) — everything else has its schema in place
(so the next pass is additive, not a redesign) but no UI yet.

| # | Module | Status |
|---|---|---|
| 1 | Auth + org setup + Clients CRUD + Client Hub activity feed | **Built** |
| 2 | People + WWCC/NDIS Worker Screening expiry tracking + dashboard alerts | **Built** |
| 3 | Roster (shift scheduling) | Schema built (`shifts`); no dedicated UI yet — shift rows exist and drive contractor compartmentalisation, but there's no roster management screen |
| 4 | Onboarding/offboarding checklists | Schema + API built (`onboarding_records`); UI exists via the People → person detail checklist for wwcc/ndis_screening/orientation/etc |
| 5 | Tasks with tagging + draft-email action | Schema built (`tasks`, `task_tags`); powers the Client Hub feed; no dedicated task board UI or draft-email action yet |
| 6 | Calendar (shared + solo) | Schema built (`events`, `event_tags`); no UI yet |
| 7 | Team Messages | Schema built (`messages`, `message_tags`); no UI yet |
| 8 | Documents with approval workflow | Schema built (`documents`, storage bucket + policies); powers the Client Hub feed; no dedicated upload/approval UI yet |
| 9 | Finances (org-level) | Schema built, treasurer-gated; no UI yet |
| 10 | Consent & Sharing Register + Share Token + public Coordinated Summary | Share tokens + public route **built** (from the Client Hub); the broader consent register (`consent_records`) has schema only, no dedicated UI |
| 11 | AI Daily Briefing (Anthropic API, server-side) | Not started — needs a server-side function (Supabase Edge Function), out of scope for a client-only pass |
| — | Reportable Incidents (NDIS/WHS/security) | **Built** — added during scoping |
| — | Risk Register | **Built** — added during scoping |
| — | Chemical register, complaints register, service agreements | Schema built; no UI yet |
| — | Restrictive practices, clinical supervision, medication authorisation | Schema built with specialist-engagement sign-off gating; no UI yet — see `SECURITY.md` on why these are deliberately containers-and-plumbing, not clinical decision tools |

Explicitly **out of scope** for this build, per the original brief:
participant funds/trust account management (legislated, needs separate
legal review), a full mobile point-of-care Shift Companion app,
voice-to-text shift note integration, and inter-organisational data
sharing beyond the read-only token-based summary.

## Visual direction

Warm sand/cream background, deep forest green primary, warm
clay/terracotta for warnings, sage for positive states, soft slate for
neutral — see the `tailwind` theme tokens in `src/index.css`. Calm,
rounded, non-clinical: this is a tool people use daily, often tired or
stressed.
