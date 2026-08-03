# Security & Compliance

This platform holds real participant, workforce, and organisational data
for KindPath Collective Inc. This document exists so that access control,
data handling, and retention are deliberate decisions someone signed off
on — not implicit defaults nobody chose.

**The platform is a vehicle of coordination, not a source of authority.**
Every role/permission default described below is a *technical encoding*
of an access policy — it should be reviewed, adjusted, and formally
adopted by KindPath's leadership/board (informed by their statutory
obligations under the NDIS Practice Standards, the Privacy Act, state
health records legislation, and WHS law) before it is treated as "the
policy." The database enforces whatever policy is configured; it does
not itself make legal determinations.

## Access model

### Roles

`profiles.role` is one of `admin`, `care_advocacy`, `committee`,
`contractor`, `specialist`.

| Role | Intent |
|---|---|
| `admin` | Full access. Platform/org administration. |
| `care_advocacy` | Care coordinators. Full clinical caseload access — the role that coordinates across every participant. |
| `committee` | Governance/board. **Deliberately does NOT get standing access to identifiable clinical records** (client files, case notes, care plans, restrictive practices, medication authorisation). Committee sees governance-level registers instead: risk register, complaints register, reportable incidents, chemical/WHS register, workforce screening-compliance status, and financials if flagged `is_treasurer`. |
| `contractor` | Frontline support workers. Compartmentalised: only see clients they are actively rostered to support, in a rolling window (default 30 days either side of a shift — see `contractor_can_access_client()` in the migrations), not the full org caseload. Cannot see restrictive-practice or medication-authorisation detail at all (see below). |
| `specialist` | Contracted external practitioners (behaviour support, clinical supervisors, prescribers). No standing access by role alone — see Specialist engagements. |

A profile's role and permissions are re-evaluated on every request (RLS
policies query `profiles` directly; nothing is cached in a JWT claim), so
a role change by an admin takes effect immediately, not on next login.

### Compartmentalisation, not just roles

Two axes of restriction sit on top of the role table:

1. **Caseload scoping for contractors.** A contractor does not get a
   permanent grant to every participant they've ever supported — access
   tracks their *current* rostering, re-evaluated live. See
   `contractor_can_access_client()` and `can_access_client()` in
   `supabase/migrations/20260803000001_extensions_and_helpers.sql`. The
   30-day window is a placeholder pending KindPath confirming their
   actual operating model — tighten or loosen it there.

2. **Specialist sign-off, not blanket clinical access.** Restrictive
   practices, clinical supervision, and restricted/S8 medication
   authorisation are modelled like a referral: `specialist_engagements`
   names a specific person, client, specialty, and time window. Only
   within an active engagement can that specialist read or authorise
   that module for that client — see
   `supabase/migrations/20260803000009_specialist_signoff_modules.sql`.
   Internal staff (`admin`/`care_advocacy`) can record the operational
   detail, but RLS cannot distinguish "correcting a typo" from
   "overriding a clinical decision" made by the engaged specialist —
   that boundary is a process control the organisation's adopted policy
   must enforce, not something the database can prove on its own.
   Contractors are excluded from these modules entirely, consistent with
   the brief's exclusion of a point-of-care app carrying live
   BSP/medication/risk data — this coordination platform is not that.

### Financial data

The brief specifies transactions are "restricted to admin/treasurer-level
roles," but the role enum has no dedicated treasurer role. Rather than
overload `committee` for every board member, `profiles.is_treasurer` is a
narrow flag an admin grants to whichever specific person actually holds
that responsibility. See `is_treasurer()`.

## Data classification (informal)

| Class | Examples | Handling |
|---|---|---|
| Identity / regulated | `ndis_number`, WWCC/screening numbers (not yet stored as raw values, only status/expiry) | Compartmentalised per above; audited |
| Clinical | `care_plan`, `goals`, case notes, restrictive practices, medication authorisation | Compartmentalised, specialist-gated where applicable; audited |
| Governance | risk register, complaints, incidents | Committee-visible; audited |
| Financial | `transactions` | Treasurer/admin only; audited |
| Operational | shifts, tasks, calendar, team messages | Org-wide among internal roles; not clinically sensitive |
| Public (opt-in) | Coordinated summary fields exposed via `share_tokens` | Anonymous, scope-limited, revocable — see below |

## Retention & deletion (placeholder — needs legal confirmation)

No table currently supports hard deletion of clinical records from the
UI, and RLS restricts `DELETE` on every substantive table to `admin`.
This is deliberate: disability/health records in NSW are typically
subject to multi-year statutory retention (commonly cited as 7 years
from last contact, longer for records concerning a minor), and the
`audit_log` table is retained indefinitely by design — it is the
accountability trail the brief explicitly asked for.

Before go-live, KindPath needs to confirm and document:
- The exact retention period(s) that apply (NDIS Commission requirements,
  NSW Health Records and Information Privacy Act, any funding-body terms).
- Whether "deletion" ever means hard delete, or only status changes
  (e.g. `clients.status = 'inactive'`) plus eventual archival.
- Who is authorised to action a deletion request (e.g. a participant's
  right-to-erasure request) and what audit trail that action itself
  leaves.

## The public Coordinated Summary route

`GET /share/:token` is the **only** anonymous-accessible surface of this
application. It is backed by a single `SECURITY DEFINER` RPC,
`get_coordinated_summary()`, which:
- Requires a valid, unrevoked, unexpired token.
- Returns only the fields allowed by that token's `scope`
  (`routines_only` / `routines_and_comms` / `full_summary`) — never the
  full client record, never any other client.
- Has no relationship to the authenticated app's session — there is no
  anon `SELECT` grant on any table, so even without this RPC, RLS alone
  already blocks anonymous reads (see
  `supabase/migrations/20260803000012_share_summary_and_storage.sql`).

Tokens are `admin`/`care_advocacy`-only to create or revoke.

## RLS testing

Every migration in `supabase/migrations/` was applied end-to-end against
a real local Postgres 16 instance (with `auth`/`storage` schemas and
`anon`/`authenticated` roles stubbed to match Supabase's own environment)
as part of building this platform, including functional tests of:
- Contractor visibility scoped to rostered clients only, and *not* to
  colleagues' shifts against the same client.
- Committee excluded from client/case-note visibility but included in
  the risk register.
- Delete restricted to admin even where insert/update is broader
  (this caught a real bug during development — a `FOR ALL` policy
  combined with a separate stricter `DELETE` policy is permissive-OR'd,
  not overridden).
- The audit log being admin-only and populated automatically via trigger.
- Treasurer-gated financial writes.
- The anonymous coordinated-summary RPC returning only scope-appropriate
  fields for a valid token, and nothing for an invalid one.

**Before go-live**, this ad hoc verification should become an automated
CI suite (e.g. via the Supabase CLI's local stack + `pgTAP`, or the same
stub-schema approach used here scripted into a repeatable test), so RLS
regressions are caught automatically as the schema evolves.

## Pre-launch checklist

- [ ] KindPath leadership formally reviews and signs off the role/access
      matrix above as adopted policy (not just an engineering default).
- [ ] Retention/deletion policy confirmed with a legal/compliance advisor
      familiar with NDIS and NSW health-records obligations.
- [ ] Automated RLS test suite wired into CI.
- [ ] Independent security review of the schema, RLS policies, and the
      public share-token route before real participant data is entered.
- [ ] Confirm the contractor roster-access window (currently 30 days)
      against KindPath's actual operating model.
- [ ] Confirm whether `committee` needs any narrower, de-identified view
      into incidents/complaints rather than full row access.
- [ ] Rotate the Supabase service-role key out of any developer's
      local environment before go-live; only server-side functions
      (e.g. the future AI Daily Briefing) should ever hold it.
