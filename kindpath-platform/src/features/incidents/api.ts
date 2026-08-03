import { supabase } from '@/lib/supabase';
import type { IncidentCategory, IncidentDomain, ReportableIncident } from '@/types/database';

export const INCIDENT_CATEGORIES: { value: IncidentCategory; label: string; domain: IncidentDomain }[] = [
  { value: 'death', label: 'Death', domain: 'ndis_reportable' },
  { value: 'serious_injury', label: 'Serious injury', domain: 'ndis_reportable' },
  { value: 'abuse', label: 'Abuse', domain: 'ndis_reportable' },
  { value: 'neglect', label: 'Neglect', domain: 'ndis_reportable' },
  { value: 'unlawful_sexual_contact', label: 'Unlawful sexual contact', domain: 'ndis_reportable' },
  { value: 'unlawful_physical_contact', label: 'Unlawful physical contact', domain: 'ndis_reportable' },
  { value: 'sexual_misconduct', label: 'Sexual misconduct', domain: 'ndis_reportable' },
  { value: 'use_of_restrictive_practice', label: 'Use of restrictive practice', domain: 'ndis_reportable' },
  { value: 'workplace_injury', label: 'Workplace injury', domain: 'whs' },
  { value: 'near_miss', label: 'Near miss', domain: 'whs' },
  { value: 'property_security', label: 'Property / security', domain: 'security' },
  { value: 'other', label: 'Other', domain: 'other' },
];

export async function listIncidents() {
  const { data, error } = await supabase
    .from('reportable_incidents')
    .select('*')
    .order('incident_at', { ascending: false });
  if (error) throw error;
  return data as ReportableIncident[];
}

export type NewIncident = Pick<
  ReportableIncident,
  'category' | 'incident_at' | 'description' | 'reported_by'
> &
  Partial<
    Omit<
      ReportableIncident,
      | 'id'
      | 'organisation_id'
      | 'created_at'
      | 'updated_at'
      | 'category'
      | 'incident_at'
      | 'description'
      | 'reported_by'
    >
  >;

export async function createIncident(input: NewIncident) {
  const { data, error } = await supabase.from('reportable_incidents').insert(input).select().single();
  if (error) throw error;
  return data as ReportableIncident;
}

export async function updateIncident(id: string, input: Partial<NewIncident>) {
  const { data, error } = await supabase
    .from('reportable_incidents')
    .update(input)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as ReportableIncident;
}
