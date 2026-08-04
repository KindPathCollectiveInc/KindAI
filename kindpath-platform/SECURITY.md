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
| `care_advocacy` | Care coordinators (support coordinators). Full *operational* clinical caseload access — but NOT a standing right to the formulation layer of specialist plans; see below. |
| `committee` | Governance/board. **Deliberately does NOT get standing access to identifiable clinical records** (client files, case notes, care plans, specialist plans). Committee sees governance-level registers instead: risk register, complaints register, reportable incidents, chemical/WHS register, workforce screening-compliance status, and financials if flagged `is_treasurer`. |
| `contractor` | Frontline support workers. Compartmentalised: only see clients they are actively rostered to support, in a rolling window (default 30 days either side of a shift — see `contractor_can_access_client()` in the migrations), not the full org caseload. |
| `specialist` | Contracted external practitioners (behaviour support practitioner, GP, psychiatrist, speech pathologist, dietician, physiotherapist, OT, clinical supervisor). No standing access by role alone — see Specialist engagements. |

A profile's role and permissions are re-evaluated on every request (RLS
policies query `profiles` directly; nothing is cached in a JWT claim), so
a role change by an admin takes effect immediately, not on next login.

### Compartmentalisation, not just roles

Several axes of restriction sit on top of the role table:

1. **Caseload scoping for contractors.** A contractor does not get a
   permanent grant to every participant they've ever supported — access
   tracks their *current* rostering, re-evaluated live. See
   `contractor_can_access_client()` and `can_access_client()` in
   `supabase/migrations/20260803000001_extensions_and_helpers.sql`. The
   30-day window is a placeholder pending KindPath confirming their
   actual operating model — tighten or loosen it there.

2. **The operational/formulation split.** This is the load-bearing
   design decision in the whole schema, arrived at through extended
   discussion with KindPath about the tension between duty of care and
   dignity of risk. A specialist plan (`specialist_plans` — Behaviour
   Support Plans, Client Risk Management Profiles, Health Care Plans,
   Epilepsy Management Plans, Medication Management, S8/PRN
   authorisation, chewing & swallowing, specialised diet, movement/
   exercise, home & equipment protocols, and whatever taxonomy KindPath
   adds via `plan_types`) is split into two tables:
   - `specialist_plans.operational_summary` — what to do, what to
     avoid, who to call. Visible to anyone with client-level access
     (`can_access_client()`), including rostered contractors, because
     withholding safety-critical information from the person actually
     delivering the shift is its own, more acute, liability exposure.
     The empirical pattern in this sector's coronial findings is
     overwhelmingly "the information existed and the person in the room
     didn't have it," not the reverse.
   - `specialist_plan_formulations.formulation_detail` — clinical
     reasoning, historical detail, diagnostic content. Gated to the
     specialist actively engaged for that client under the plan's
     responsible profession, an admin, or someone holding a specific
     `access_grants` row (see below). NOT a blanket `care_advocacy`
     default — internal coordination staff manage the plan
     administratively without standing access to the reasoning behind
     it. This is the layer that produces "identity lock" — a
     restrictive element from someone's past quietly becoming a
     permanent character label — if nobody ever revisits it, which is
     why `plan_reviews` (below) exists.

   Same reasoning, same split, applies to `plan_reviews`
   (broadly visible: outcome, the participant's own voice) vs
   `plan_review_clinical_notes` (gated: the clinical discussion).

3. **`access_grants`: the "thoroughly scoped, justified and
   systematised" elevation mechanism.** When a new person genuinely
   needs formulation-layer access — onboarding onto a participant's
   caseload, a new prescriber taking over care — an admin/care_advocacy
   grants it explicitly: scoped to one plan, one plan type, or one
   client's formulations; with a required justification; approved by a
   named person; optionally time-limited; revocable at any time. See
   `supabase/migrations/20260803000013_access_grants.sql`. This is the
   same shape as `share_tokens` — scoped, justified, revocable, audited
   — applied internally instead of externally.

4. **Specialist engagements, not blanket clinical access.**
   `specialist_engagements` names a specific person, client, profession,
   and time window — modelled on a referral. Only within an active
   engagement can that specialist read/authorise the formulation layer
   for that client under that profession — see
   `supabase/migrations/20260803000009_specialist_signoff_modules.sql`.
   RLS cannot distinguish "correcting a typo" from "overriding a
   clinical decision" made by the engaged specialist — that boundary is
   a process control the organisation's adopted policy must enforce, not
   something the database can prove on its own. Contractors are excluded
   from the formulation layer entirely, consistent with the brief's
   exclusion of a point-of-care app carrying live BSP/medication/risk
   data — this coordination platform is not that.

5. **Mandatory, risk-tiered, cross-service review — the answer to
   "identity lock".** Every specialist plan carries an append-only
   history of risk ratings (`specialist_plan_risk_ratings` — suggested
   from incident frequency, always overridable by the engaged specialist
   with a documented rationale) which drives how often it must be
   reviewed, via an org-editable cadence lookup
   (`review_cadence_rules`, seeded low=12/medium=6/high=3/critical=1
   months — 12 months is the enforced ceiling). A `plan_reviews` record
   captures the outcome (continue/reduce/eliminate/escalate) and links
   to the resulting rating, building the evidence trail KindPath asked
   for explicitly: "learn from the process each time, in a tracked and
   measurable way." Attendance (`review_participants`) is split into two
   segments — who was present for the participant's own voice vs the
   clinical/cross-service discussion — because the participant (or an
   advocate standing in for them) is required in the process without
   being required to sit inside a multi-professional discussion of their
   own pathology. Most stakeholders in a review (family, advocates,
   community members, worker representatives) will never have a login,
   hence `external_name` alongside `profile_id`.

6. **Escalation is staged, not a single notification.**
   `escalations` progresses through
   raised → groundwork → risk_compliance_review → ceo_reviewed →
   resolved, with an append-only `escalation_updates` trail so the
   CEO/President has visibility at every stage, not just a final
   sign-off — final decision authority always sits with whoever holds
   `is_ceo_escalation_point`. Routing uses flags on `profiles`
   (`handles_risk_compliance`, `handles_participant_outcomes`,
   `is_ceo_escalation_point`), the same pattern as `is_treasurer` below,
   deliberately not a first-class "teams" org-chart structure — KindPath
   is small today and these flags can be held by one person or many
   without any schema change either way.

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
| Clinical — operational | `specialist_plans.operational_summary`, `care_plan`, `goals`, case notes | Broadly visible to anyone with client access, including rostered contractors; audited |
| Clinical — formulation | `specialist_plan_formulations.formulation_detail`, `plan_review_clinical_notes.clinical_summary`, risk ratings and their rationale | Specialist-engagement-gated or `access_grants`-gated only; admin override; audited |
| Governance | risk register, complaints, incidents, escalations | Committee-visible; audited |
| Financial | `transactions` | Treasurer/admin only; audited |
| Operational | shifts, tasks, calendar, team messages | Org-wide among internal roles; not clinically sensitive |
| Public (opt-in) | Coordinated summary fields exposed via `share_tokens` | Anonymous, scope-limited, revocable — see below |

## Retention & deletion

Two tiers, per KindPath's stated policy ("nothing substantial is deleted
without oversight from CEO/President," with "gates... to stop excess
noise like accidental duplicate notes filling up the archives"):

1. **Noise.** A case note's author can self-retract it within a 15
   minute grace window of creation (`notes_delete_grace_window` in
   `supabase/migrations/20260803000004_notes_shifts.sql`) — no approval
   needed, for the ordinary case of an accidental duplicate. Past that
   window, the same note has no raw deletion path at all — it falls into
   tier 2.

2. **Everything substantial.** Every other record type that matters —
   clients, notes past the grace window, documents, transactions,
   incidents, risk register, consent records, specialist engagements/
   plans/formulations/risk ratings, plan reviews, escalations, complaints
   — has **no admin DELETE policy at all**. This is a deliberate,
   tested property, not a convention: an admin running a raw `DELETE`
   against any of these tables affects zero rows (verified locally — see
   RLS testing below). The only path is `deletion_requests`: anyone
   raises a request with a reason; only a profile holding
   `is_ceo_escalation_point` can decide it; approval happens exclusively
   through the `execute_approved_deletion()` `SECURITY DEFINER`
   function, which performs the actual delete and marks the request
   approved in the same transaction — an ordinary `UPDATE` can never set
   a request to `approved` itself (RLS `WITH CHECK` blocks it), so that
   status can never be true without the row having actually been
   deleted. See `supabase/migrations/20260803000017_deletion_requests.sql`.

Still outstanding before go-live, because this is policy the platform
enforces, not policy it invents:
- The exact statutory retention period(s) that apply (NDIS Commission
  requirements, NSW Health Records and Information Privacy Act, any
  funding-body terms) — confirm with a legal/compliance advisor.
- Whether a CEO-approved deletion should also require a documented legal
  basis recorded on the request (e.g. a participant's right-to-erasure
  request under the Privacy Act) beyond the free-text `reason` field.
- Whether the 15-minute grace window should extend to any other
  high-frequency-entry table beyond `notes`, if the same noise problem
  shows up elsewhere.

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
- The operational/formulation split: a rostered contractor and an
  unengaged `care_advocacy` profile both see a plan's
  `operational_summary` but get zero rows from
  `specialist_plan_formulations`; the engaged specialist and admin do;
  an *outsider* specialist with no engagement for that client gets zero.
- `access_grants` end to end: a new worker with no engagement sees
  nothing, gains access the moment a scoped grant is inserted, and loses
  it again the instant that grant is revoked.
- The deletion gate: a raw `DELETE` from an authenticated admin session
  affects zero rows on every gated table; a non-CEO-flagged profile is
  blocked from both deciding a request via `UPDATE` and from calling
  `execute_approved_deletion()` (raises an exception); a CEO-flagged
  profile's approval both deletes the row and marks the request
  `approved` in one transaction.
- The notes grace window: self-retract succeeds inside 15 minutes, and
  the same delete affects zero rows once backdated past it — for both
  the author and an admin.
- A full regression pass of every test from the previous verification
  round (contractor/committee/audit-log/treasurer behaviour) after all
  of the above was added, to catch anything the new migrations disturbed.

This caught two real, otherwise-silent bugs worth naming because they're
easy to reintroduce: (1) `specialist_plan_formulations` and
`plan_review_clinical_notes` were originally keyed by their foreign-key
column as primary key with no `id` column — the generic `log_audit()`
trigger assumes every audited table has one, and failed at insert time,
not at migration time, so it only surfaced under an actual functional
test. (2) `LANGUAGE SQL` helper functions that forward-reference a table
created by a later migration fail at `CREATE FUNCTION` time, not at call
time — every RLS helper in this schema is `LANGUAGE PLPGSQL` specifically
to avoid that.

**Before go-live**, this ad hoc verification should become an automated
CI suite (e.g. via the Supabase CLI's local stack + `pgTAP`, or the same
stub-schema approach used here scripted into a repeatable test), so RLS
regressions are caught automatically as the schema evolves.

## Pre-launch checklist

- [ ] KindPath leadership formally reviews and signs off the role/access
      matrix above as adopted policy (not just an engineering default),
      **specifically including** the operational/formulation split and
      who besides the engaged specialist should have standing
      formulation-layer access (as discussed: this was left as
      specialist-engagement + `access_grants` only, deliberately
      excluding a blanket `care_advocacy` default).
- [ ] Legal/compliance advisor confirms: statutory retention periods;
      whether a CEO-approved deletion needs a recorded legal basis beyond
      free text; the NDIS/WHS categorisation logic in
      `reportable_incidents` and the escalation thresholds in
      `review_cadence_rules`.
- [ ] Automated RLS test suite wired into CI (the manual local-Postgres
      verification described above should become scripted and repeatable
      rather than re-run ad hoc for every schema change).
- [ ] Independent security review of the schema, RLS policies, and the
      public share-token route before real participant data is entered.
- [ ] Confirm the contractor roster-access window (currently 30 days)
      against KindPath's actual operating model.
- [ ] Confirm whether `committee` needs any narrower, de-identified view
      into incidents/complaints rather than full row access.
- [ ] Confirm the `review_cadence_rules` defaults (critical=1,
      high=3, medium=6, low=12 months) against KindPath's actual risk
      tiering practice — seeded as a starting policy, not a determination.
- [ ] Decide who initially holds `handles_risk_compliance`,
      `handles_participant_outcomes`, and `is_ceo_escalation_point` —
      today's build ships with nobody flagged except whoever an admin
      sets manually.
- [ ] Rotate the Supabase service-role key out of any developer's
      local environment before go-live; only server-side functions
      (e.g. the future AI Daily Briefing) should ever hold it.
