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

The backend is already live the moment your Supabase project exists and
the migrations are applied. The frontend has three ways to run:

**GitHub Pages** (this repo's default): `.github/workflows/deploy-pages.yml`
builds and deploys automatically on every push to `main` that touches
`kindpath-platform/`. One manual, one-time step is required — GitHub
doesn't allow enabling Pages via the same API surface used everywhere
else in this build: go to the repo's **Settings → Pages → Source** and
select **GitHub Actions**. After that, every push deploys itself; check
the **Actions** tab for the live URL (`https://<org>.github.io/<repo>/`).
The routing is hash-based (`#/clients`, not `/clients`) specifically so
this works with zero server configuration — see the comment in
`src/App.tsx` for why.

`.env.production` is committed (not gitignored) with the real project
URL and publishable key — this is deliberate, not an oversight. Both
values are designed to be public; RLS is what actually protects data,
not secrecy of this key. The **secret key never goes in any file** —
see `SECURITY.md`.

**Vercel or Netlify**, if you'd rather not use Pages: point either at
this directory, set the same two `VITE_SUPABASE_*` env vars in their
dashboard (or just let it use the committed `.env.production`), build
command `npm run build`, output directory `dist`. Works with
`BrowserRouter` too if you switch back — Pages is what specifically
needs the hash-routing workaround.

**Electron desktop app** (Mac/Windows/Linux): `npm run electron` builds
the web app and launches it in a native window — no separate backend to
run, it's the same static build talking to the same Supabase project. To
produce an installable app: `npm run electron:dist:mac`,
`electron:dist:win`, or `electron:dist:linux` (output lands in
`release/`). These builds are unsigned (no Apple/Windows code-signing
certificate configured yet), so macOS Gatekeeper and Windows SmartScreen
will warn on first launch until that's set up — expected, not a bug.

## What's built vs. what's roadmap

The brief specified 11 modules, in a deliberate build order. Between
the first milestone, the compliance/governance modules that came out of
extended scoping discussion with KindPath, and this pass, every brief
module except the AI Daily Briefing and the broader consent/chemical/
complaints/service-agreement registers now has working UI, not just
schema.

| # | Module | Status |
|---|---|---|
| 1 | Auth + org setup + Clients CRUD + Client Hub activity feed | **Built** |
| 2 | People + WWCC/NDIS Worker Screening expiry tracking + dashboard alerts | **Built** |
| 3 | Roster (shift scheduling) | **Built** — schedule a shift, upcoming/past views, a worker can mark their own shift complete |
| 4 | Onboarding/offboarding checklists | **Built** — People → person detail checklist for wwcc/ndis_screening/orientation/etc |
| 5 | Tasks with tagging + draft-email action | Schema built (`tasks`, `task_tags`); powers the Client Hub feed; no dedicated task board UI or draft-email action yet |
| 6 | Calendar (shared + solo) | **Built** — add/view shared and solo events, upcoming + past |
| 7 | Team Messages | **Built** — a simple shared noticeboard (tagging to a client/person exists in the API, not yet surfaced in the UI) |
| 8 | Documents with approval workflow | **Built** — upload (client-linked from the Client Hub, or org-wide policies/induction packs), draft → pending approval → approved, BSP/Risk Plan caution banner |
| 9 | Finances (org-level) | **Built** — treasurer-gated income/expense list + entry, income/expense/net summary, labelled everywhere as organisational funds only |
| 10 | Consent & Sharing Register + Share Token + public Coordinated Summary | Share tokens + public route **built** (from the Client Hub); the broader consent register (`consent_records`) has schema only, no dedicated UI |
| 11 | AI Daily Briefing (Anthropic API, server-side) | Not started — needs a server-side function (Supabase Edge Function), out of scope for a client-only pass |
| — | Reportable Incidents (NDIS/WHS/security) | **Built** — added during scoping |
| — | Risk Register | **Built** — added during scoping |
| — | Chemical register, complaints register, service agreements | Schema built; no UI yet |
| — | Specialist plan taxonomy (BSP, Client Risk Profile, Health Care Plan, Epilepsy Management, Medication Management, S8/PRN, chewing & swallowing, diet, movement, home/equipment) | **Built** — create/view a plan from the Client Hub, operational summary editable by care coordinators, formulation layer editable by the engaged specialist/admin with graceful "no access" degradation |
| — | `access_grants` — justified, scoped, revocable elevation to formulation-layer access | **Built** — panel on each plan's page to grant/revoke with a required justification |
| — | Mandatory risk-tiered plan review (participant/advocate voice, cross-service attendance, staged escalation to CEO/President) | **Built** — risk rating with suggested/override history, schedule and record a review's outcome, split participant-voice/clinical-discussion attendance (internal + external stakeholders), overdue reviews surfaced on the dashboard |
| — | Staged escalations (raised → groundwork → risk/compliance review → CEO reviewed → resolved) | **Built** — raise, assign owners (risk & compliance / participant outcomes / CEO), advance stage, append-only update trail |
| — | Deletion-request workflow (CEO/President-gated, with a grace-window self-retract for noise) | **Built** — a decision queue page, a reusable "Request deletion" action (wired into the Client Hub as the flagship example), and role/flag management (treasurer, risk & compliance, participant outcomes, CEO/President escalation point) on each person's People page |

Explicitly **out of scope** for this build, per the original brief:
participant funds/trust account management (legislated, needs separate
legal review), a full mobile point-of-care Shift Companion app,
voice-to-text shift note integration, and inter-organisational data
sharing beyond the read-only token-based summary.

**Native mobile apps** (iOS/Android, App Store/Play Store) are a
deliberately deferred later step, not started here — a materially
bigger undertaking than the web/Electron builds (developer accounts,
app review, ongoing store maintenance), separate from the point-of-care
Shift Companion app noted above, which needs its own dedicated scoping
regardless of packaging.

## Visual direction

Warm sand/cream background, deep forest green primary, warm
clay/terracotta for warnings, sage for positive states, soft slate for
neutral — see the `tailwind` theme tokens in `src/index.css`. Calm,
rounded, non-clinical: this is a tool people use daily, often tired or
stressed.
