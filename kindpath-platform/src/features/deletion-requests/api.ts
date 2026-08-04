import { supabase } from '@/lib/supabase';
import type { DeletableTable, DeletionRequest } from '@/types/database';

export async function listDeletionRequests() {
  const { data, error } = await supabase
    .from('deletion_requests')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as DeletionRequest[];
}

export async function raiseDeletionRequest(
  tableName: DeletableTable,
  recordId: string,
  reason: string,
  requestedBy: string,
) {
  const { data, error } = await supabase
    .from('deletion_requests')
    .insert({ table_name: tableName, record_id: recordId, reason, requested_by: requestedBy })
    .select()
    .single();
  if (error) throw error;
  return data as DeletionRequest;
}

export async function declineDeletionRequest(id: string, decisionNote: string) {
  const { error } = await supabase
    .from('deletion_requests')
    .update({ status: 'declined', decision_note: decisionNote })
    .eq('id', id);
  if (error) throw error;
}

// The only path that actually deletes the underlying row — see
// execute_approved_deletion() in supabase/migrations/..._deletion_requests.sql.
// Restricted server-side to profiles holding is_ceo_escalation_point.
export async function approveDeletionRequest(id: string) {
  const { error } = await supabase.rpc('execute_approved_deletion', { request_id: id });
  if (error) throw error;
}

export const DELETABLE_TABLE_LABELS: Record<DeletableTable, string> = {
  clients: 'Client',
  notes: 'Case note',
  documents: 'Document',
  transactions: 'Transaction',
  reportable_incidents: 'Reportable incident',
  risk_register: 'Risk register entry',
  consent_records: 'Consent record',
  specialist_engagements: 'Specialist engagement',
  specialist_plans: 'Specialist plan',
  specialist_plan_formulations: 'Plan formulation',
  specialist_plan_risk_ratings: 'Risk rating',
  plan_reviews: 'Plan review',
  plan_review_clinical_notes: 'Review clinical note',
  review_participants: 'Review attendee',
  escalations: 'Escalation',
  escalation_updates: 'Escalation update',
  complaints_register: 'Complaint',
};
