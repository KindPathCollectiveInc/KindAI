import { supabase } from '@/lib/supabase';
import type {
  PlanReview,
  PlanReviewClinicalNote,
  ReviewCadenceRule,
  ReviewOutcome,
  ReviewParticipant,
  ReviewParticipantType,
  ReviewSegment,
  RiskLevel,
  SpecialistPlanRiskRating,
} from '@/types/database';

export async function listRiskRatings(planId: string) {
  const { data, error } = await supabase
    .from('specialist_plan_risk_ratings')
    .select('*')
    .eq('specialist_plan_id', planId)
    .order('effective_from', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as SpecialistPlanRiskRating[];
}

export async function setRiskRating(input: {
  specialist_plan_id: string;
  tier: RiskLevel;
  rationale?: string | null;
  set_by: string;
}) {
  const { data, error } = await supabase
    .from('specialist_plan_risk_ratings')
    .insert({
      specialist_plan_id: input.specialist_plan_id,
      tier: input.tier,
      source: input.rationale ? 'clinical_override' : 'suggested',
      rationale: input.rationale ?? null,
      set_by: input.set_by,
    })
    .select()
    .single();
  if (error) throw error;
  return data as SpecialistPlanRiskRating;
}

export async function listCadenceRules() {
  const { data, error } = await supabase
    .from('review_cadence_rules')
    .select('*')
    .order('interval_months');
  if (error) throw error;
  return data as ReviewCadenceRule[];
}

export async function updateCadenceRule(id: string, intervalMonths: number, updatedBy: string) {
  const { error } = await supabase
    .from('review_cadence_rules')
    .update({ interval_months: intervalMonths, updated_by: updatedBy })
    .eq('id', id);
  if (error) throw error;
}

export async function listReviewsForPlan(planId: string) {
  const { data, error } = await supabase
    .from('plan_reviews')
    .select('*')
    .eq('specialist_plan_id', planId)
    .order('scheduled_date', { ascending: false });
  if (error) throw error;
  return data as PlanReview[];
}

export type NewReview = Pick<PlanReview, 'specialist_plan_id' | 'scheduled_date'>;

export async function scheduleReview(input: NewReview) {
  const { data, error } = await supabase.from('plan_reviews').insert(input).select().single();
  if (error) throw error;
  return data as PlanReview;
}

export async function recordReviewOutcome(
  reviewId: string,
  outcome: ReviewOutcome,
  participantInput: string | null,
  resultingRiskRatingId: string | null,
  nextReviewDue: string | null,
) {
  const { data, error } = await supabase
    .from('plan_reviews')
    .update({
      status: 'held',
      held_date: new Date().toISOString().slice(0, 10),
      outcome,
      participant_input: participantInput,
      resulting_risk_rating_id: resultingRiskRatingId,
      next_review_due: nextReviewDue,
    })
    .eq('id', reviewId)
    .select()
    .single();
  if (error) throw error;
  return data as PlanReview;
}

export async function getReviewClinicalNote(reviewId: string) {
  const { data, error } = await supabase
    .from('plan_review_clinical_notes')
    .select('*')
    .eq('review_id', reviewId)
    .maybeSingle();
  if (error) throw error;
  return data as PlanReviewClinicalNote | null;
}

export async function upsertReviewClinicalNote(reviewId: string, summary: string, existingId?: string) {
  if (existingId) {
    const { error } = await supabase
      .from('plan_review_clinical_notes')
      .update({ clinical_summary: summary })
      .eq('id', existingId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from('plan_review_clinical_notes')
    .insert({ review_id: reviewId, clinical_summary: summary });
  if (error) throw error;
}

export async function listParticipants(reviewId: string) {
  const { data, error } = await supabase
    .from('review_participants')
    .select('*')
    .eq('review_id', reviewId)
    .order('created_at');
  if (error) throw error;
  return data as ReviewParticipant[];
}

export async function addParticipant(input: {
  review_id: string;
  participant_type: ReviewParticipantType;
  attended_segment: ReviewSegment;
  profile_id?: string | null;
  external_name?: string | null;
  external_relationship?: string | null;
}) {
  const { error } = await supabase.from('review_participants').insert(input);
  if (error) throw error;
}

export const PARTICIPANT_TYPE_LABELS: Record<ReviewParticipantType, string> = {
  specialist: 'Specialist',
  support_coordinator: 'Support coordinator',
  family: 'Family',
  advocate: 'Advocate',
  service_manager: 'Service manager',
  community_member: 'Community member',
  worker_representative: 'Worker representative',
  participant: 'Participant',
  other: 'Other',
};

export const RISK_LEVELS: RiskLevel[] = ['low', 'medium', 'high', 'critical'];

export interface OverdueReview {
  reviewId: string;
  planId: string;
  scheduledDate: string;
  daysOverdue: number;
}

export async function listOverdueReviews(): Promise<OverdueReview[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('plan_reviews')
    .select('*')
    .eq('status', 'scheduled')
    .lt('scheduled_date', today)
    .order('scheduled_date');
  if (error) throw error;

  const now = Date.now();
  return (data as PlanReview[]).map((r) => ({
    reviewId: r.id,
    planId: r.specialist_plan_id,
    scheduledDate: r.scheduled_date,
    daysOverdue: Math.ceil((now - new Date(r.scheduled_date).getTime()) / (1000 * 60 * 60 * 24)),
  }));
}
