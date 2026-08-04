import { supabase } from '@/lib/supabase';
import type {
  PlanType,
  SignoffStatus,
  Specialty,
  SpecialistEngagement,
  SpecialistPlan,
  SpecialistPlanFormulation,
} from '@/types/database';

export async function listPlanTypes() {
  const { data, error } = await supabase.from('plan_types').select('*').eq('active', true).order('name');
  if (error) throw error;
  return data as PlanType[];
}

export async function listPlansForClient(clientId: string) {
  const { data, error } = await supabase
    .from('specialist_plans')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as SpecialistPlan[];
}

export async function getPlan(id: string) {
  const { data, error } = await supabase.from('specialist_plans').select('*').eq('id', id).single();
  if (error) throw error;
  return data as SpecialistPlan;
}

export type NewPlan = Pick<SpecialistPlan, 'client_id' | 'plan_type_id' | 'operational_summary'>;

export async function createPlan(input: NewPlan) {
  const { data, error } = await supabase.from('specialist_plans').insert(input).select().single();
  if (error) throw error;
  return data as SpecialistPlan;
}

export async function updatePlanStatus(id: string, status: SignoffStatus, authorisedBy?: string) {
  const patch: Partial<Omit<SpecialistPlan, 'id' | 'organisation_id' | 'created_at' | 'updated_at'>> = {
    status,
  };
  if (status === 'authorised' && authorisedBy) {
    patch.authorised_by = authorisedBy;
    patch.authorised_at = new Date().toISOString();
  }
  const { data, error } = await supabase.from('specialist_plans').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data as SpecialistPlan;
}

export async function updatePlanOperationalSummary(id: string, operational_summary: string) {
  const { data, error } = await supabase
    .from('specialist_plans')
    .update({ operational_summary })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as SpecialistPlan;
}

// Returns null when RLS hides the row rather than throwing — "no access"
// and "nothing written yet" both surface the same way, which is exactly
// right for a UI that should degrade gracefully rather than error.
export async function getFormulation(planId: string) {
  const { data, error } = await supabase
    .from('specialist_plan_formulations')
    .select('*')
    .eq('specialist_plan_id', planId)
    .maybeSingle();
  if (error) throw error;
  return data as SpecialistPlanFormulation | null;
}

export async function upsertFormulation(planId: string, formulationDetail: string, existingId?: string) {
  if (existingId) {
    const { data, error } = await supabase
      .from('specialist_plan_formulations')
      .update({ formulation_detail: formulationDetail })
      .eq('id', existingId)
      .select()
      .single();
    if (error) throw error;
    return data as SpecialistPlanFormulation;
  }
  const { data, error } = await supabase
    .from('specialist_plan_formulations')
    .insert({ specialist_plan_id: planId, formulation_detail: formulationDetail })
    .select()
    .single();
  if (error) throw error;
  return data as SpecialistPlanFormulation;
}

export async function listEngagementsForClient(clientId: string) {
  const { data, error } = await supabase
    .from('specialist_engagements')
    .select('*')
    .eq('client_id', clientId)
    .order('start_date', { ascending: false });
  if (error) throw error;
  return data as SpecialistEngagement[];
}

export type NewEngagement = Pick<SpecialistEngagement, 'specialist_id' | 'client_id' | 'specialty'> &
  Partial<Pick<SpecialistEngagement, 'referral_notes' | 'end_date'>>;

export async function createEngagement(input: NewEngagement) {
  const { data, error } = await supabase.from('specialist_engagements').insert(input).select().single();
  if (error) throw error;
  return data as SpecialistEngagement;
}

export async function endEngagement(id: string) {
  const { data, error } = await supabase
    .from('specialist_engagements')
    .update({ status: 'ended', end_date: new Date().toISOString().slice(0, 10) })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as SpecialistEngagement;
}

export const SPECIALTY_LABELS: Record<Specialty, string> = {
  behaviour_support_practitioner: 'Behaviour Support Practitioner',
  gp: 'GP',
  psychiatrist: 'Psychiatrist',
  speech_pathologist: 'Speech Pathologist',
  dietician: 'Dietician',
  physiotherapist: 'Physiotherapist',
  occupational_therapist: 'Occupational Therapist',
  clinical_supervisor: 'Clinical Supervisor',
  other: 'Other',
};
