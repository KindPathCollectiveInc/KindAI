import { supabase } from '@/lib/supabase';
import type { Escalation, EscalationStatus, EscalationUpdate } from '@/types/database';

export async function listEscalations() {
  const { data, error } = await supabase
    .from('escalations')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Escalation[];
}

export async function getEscalation(id: string) {
  const { data, error } = await supabase.from('escalations').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Escalation;
}

export type NewEscalation = Pick<Escalation, 'reason' | 'raised_by'> & Partial<Pick<Escalation, 'client_id'>>;

export async function raiseEscalation(input: NewEscalation) {
  const { data, error } = await supabase.from('escalations').insert(input).select().single();
  if (error) throw error;
  return data as Escalation;
}

export async function assignEscalation(
  id: string,
  patch: Partial<Pick<Escalation, 'risk_compliance_owner' | 'participant_outcomes_owner' | 'ceo_id'>>,
) {
  const { error } = await supabase.from('escalations').update(patch).eq('id', id);
  if (error) throw error;
}

export async function advanceEscalation(id: string, status: EscalationStatus) {
  const patch: Partial<Omit<Escalation, 'id' | 'organisation_id' | 'created_at' | 'updated_at'>> = {
    status,
  };
  if (status === 'resolved') patch.resolved_at = new Date().toISOString();
  const { error } = await supabase.from('escalations').update(patch).eq('id', id);
  if (error) throw error;
}

export async function listEscalationUpdates(escalationId: string) {
  const { data, error } = await supabase
    .from('escalation_updates')
    .select('*')
    .eq('escalation_id', escalationId)
    .order('created_at');
  if (error) throw error;
  return data as EscalationUpdate[];
}

export async function addEscalationUpdate(
  escalationId: string,
  authorId: string,
  stage: EscalationStatus,
  note: string,
) {
  const { error } = await supabase
    .from('escalation_updates')
    .insert({ escalation_id: escalationId, author_id: authorId, stage, note });
  if (error) throw error;
}

export const ESCALATION_STAGES: EscalationStatus[] = [
  'raised',
  'groundwork',
  'risk_compliance_review',
  'ceo_reviewed',
  'resolved',
];
