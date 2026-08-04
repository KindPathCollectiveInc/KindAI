import { supabase } from '@/lib/supabase';
import type { Shift, ShiftStatus } from '@/types/database';

// RLS already scopes this correctly per caller: admin/care_advocacy/
// committee see every shift, a contractor sees only their own — so one
// query works for both the roster-manager view and "my shifts".
export async function listShifts() {
  const { data, error } = await supabase.from('shifts').select('*').order('date', { ascending: true });
  if (error) throw error;
  return data as Shift[];
}

export type NewShift = Pick<Shift, 'client_id' | 'staff_id' | 'date'> &
  Partial<Pick<Shift, 'start_time' | 'end_time' | 'notes'>>;

export async function createShift(input: NewShift) {
  const { data, error } = await supabase.from('shifts').insert(input).select().single();
  if (error) throw error;
  return data as Shift;
}

export async function updateShift(id: string, patch: Partial<Pick<Shift, 'status' | 'notes'>>) {
  const { data, error } = await supabase.from('shifts').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data as Shift;
}

export const SHIFT_STATUS_LABELS: Record<ShiftStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
