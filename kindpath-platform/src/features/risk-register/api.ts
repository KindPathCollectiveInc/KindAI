import { supabase } from '@/lib/supabase';
import type { RiskCategory, RiskLevel, RiskRegisterEntry } from '@/types/database';

export const RISK_CATEGORIES: { value: RiskCategory; label: string }[] = [
  { value: 'operational', label: 'Operational' },
  { value: 'financial', label: 'Financial' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'whs', label: 'WHS' },
  { value: 'clinical', label: 'Clinical' },
  { value: 'reputational', label: 'Reputational' },
  { value: 'other', label: 'Other' },
];

export const RISK_LEVELS: RiskLevel[] = ['low', 'medium', 'high', 'critical'];

const levelScore: Record<RiskLevel, number> = { low: 1, medium: 2, high: 3, critical: 4 };

export function riskScore(entry: Pick<RiskRegisterEntry, 'likelihood' | 'impact'>) {
  return levelScore[entry.likelihood] * levelScore[entry.impact];
}

export async function listRisks() {
  const { data, error } = await supabase.from('risk_register').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data as RiskRegisterEntry[];
}

export type NewRisk = Pick<RiskRegisterEntry, 'title' | 'category' | 'likelihood' | 'impact'> &
  Partial<
    Omit<
      RiskRegisterEntry,
      'id' | 'organisation_id' | 'created_at' | 'updated_at' | 'title' | 'category' | 'likelihood' | 'impact'
    >
  >;

export async function createRisk(input: NewRisk) {
  const { data, error } = await supabase.from('risk_register').insert(input).select().single();
  if (error) throw error;
  return data as RiskRegisterEntry;
}

export async function updateRisk(id: string, input: Partial<NewRisk>) {
  const { data, error } = await supabase.from('risk_register').update(input).eq('id', id).select().single();
  if (error) throw error;
  return data as RiskRegisterEntry;
}
