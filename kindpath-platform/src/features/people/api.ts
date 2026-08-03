import { supabase } from '@/lib/supabase';
import type { OnboardingRecord, OnboardingStep, Profile } from '@/types/database';

export const ONBOARDING_STEPS: { key: OnboardingStep; label: string; hasExpiry: boolean }[] = [
  { key: 'wwcc', label: 'Working With Children Check', hasExpiry: true },
  { key: 'ndis_screening', label: 'NDIS Worker Screening', hasExpiry: true },
  { key: 'orientation', label: 'Orientation', hasExpiry: false },
  { key: 'code_of_conduct', label: 'Code of Conduct acknowledgement', hasExpiry: false },
  { key: 'referees', label: 'Referee checks', hasExpiry: false },
  { key: 'induction', label: 'Induction', hasExpiry: false },
];

export const EXPIRY_ALERT_WINDOW_DAYS = 90;

export async function listPeople() {
  const { data, error } = await supabase.from('profiles').select('*').order('full_name');
  if (error) throw error;
  return data as Profile[];
}

export async function getPerson(id: string) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Profile;
}

export async function listOnboardingRecords(personId?: string) {
  let query = supabase.from('onboarding_records').select('*');
  if (personId) query = query.eq('person_id', personId);
  const { data, error } = await query;
  if (error) throw error;
  return data as OnboardingRecord[];
}

export async function upsertOnboardingRecord(input: {
  person_id: string;
  step: OnboardingStep;
  completed: boolean;
  completed_date?: string | null;
  expiry_date?: string | null;
  notes?: string | null;
}) {
  const { data, error } = await supabase
    .from('onboarding_records')
    .upsert(input, { onConflict: 'person_id,step' })
    .select()
    .single();
  if (error) throw error;
  return data as OnboardingRecord;
}

export interface ExpiringScreening {
  personId: string;
  personName: string;
  step: OnboardingStep;
  expiryDate: string;
  daysRemaining: number;
}

export async function listExpiringScreenings(): Promise<ExpiringScreening[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + EXPIRY_ALERT_WINDOW_DAYS);

  const { data: records, error } = await supabase
    .from('onboarding_records')
    .select('*')
    .in('step', ['wwcc', 'ndis_screening'])
    .not('expiry_date', 'is', null)
    .lte('expiry_date', cutoff.toISOString().slice(0, 10))
    .order('expiry_date');

  if (error) throw error;
  if (!records || records.length === 0) return [];

  const personIds = [...new Set(records.map((r) => r.person_id))];
  const { data: people, error: peopleError } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', personIds);
  if (peopleError) throw peopleError;

  const nameById = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const today = new Date();

  return (records as OnboardingRecord[]).map((row) => ({
    personId: row.person_id,
    personName: nameById.get(row.person_id) ?? 'Unknown',
    step: row.step,
    expiryDate: row.expiry_date as string,
    daysRemaining: Math.ceil(
      (new Date(row.expiry_date as string).getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    ),
  }));
}
