-- Seeds the single organisation row this build assumes at launch.
-- handle_new_user() (see migrations) attaches every new signup to
-- whichever organisation was created first, so this must run before
-- anyone signs up.
insert into public.organisations (name)
values ('KindPath Collective Inc')
on conflict do nothing;

-- Everything below runs with no authenticated user (a raw psql/service-
-- role connection), so set_organisation_id() passes the explicit
-- organisation_id through unchanged rather than overriding it — see the
-- comment on that function in 20260803000001_extensions_and_helpers.sql.
do $$
declare
  v_org uuid;
begin
  select id into v_org from public.organisations order by created_at asc limit 1;

  -- Review cadence: annual is the floor (matches the interval_months
  -- <= 12 check on the table) regardless of tier; scoping to
  -- monthly/quarterly/6-monthly for anything riskier than low is
  -- KindPath's stated starting policy, not a fixed rule — tune freely
  -- via the People/governance settings once that UI exists, or directly
  -- in this table today.
  insert into public.review_cadence_rules (organisation_id, tier, interval_months)
  values
    (v_org, 'critical', 1),
    (v_org, 'high', 3),
    (v_org, 'medium', 6),
    (v_org, 'low', 12)
  on conflict (organisation_id, tier) do nothing;

  -- Initial plan type taxonomy, mapped to the profession responsible
  -- for each — see SECURITY.md for why this taxonomy exists and how the
  -- operational/formulation split around it works. Add more rows here
  -- (or via the app once that UI exists) as new plan types come up —
  -- this is reference data, not schema.
  insert into public.plan_types (organisation_id, code, name, responsible_specialty)
  values
    (v_org, 'bsp', 'Behaviour Support Plan', 'behaviour_support_practitioner'),
    (v_org, 'client_risk_profile', 'Client Risk Management Profile', 'behaviour_support_practitioner'),
    (v_org, 'epilepsy_management_plan', 'Epilepsy Management Plan', 'gp'),
    (v_org, 'health_care_plan', 'Health Care Plan', 'gp'),
    (v_org, 'medication_management_plan', 'Medication Management Plan', 'gp'),
    (v_org, 's8_prn_medication', 'S8 / PRN Medication Authorisation', 'psychiatrist'),
    (v_org, 'chewing_swallowing_plan', 'Chewing & Swallowing Plan', 'speech_pathologist'),
    (v_org, 'specialised_diet_plan', 'Specialised Diet Plan', 'dietician'),
    (v_org, 'movement_exercise_protocol', 'Movement, Stretching & Exercise Protocol', 'physiotherapist'),
    (v_org, 'home_equipment_protocol', 'Home & Equipment Protocol', 'occupational_therapist')
  on conflict (organisation_id, code) do nothing;
end $$;
