import { supabase } from '@/lib/supabase';
import type { Event, EventVisibility } from '@/types/database';

export async function listEvents() {
  const { data, error } = await supabase.from('events').select('*').order('date', { ascending: true });
  if (error) throw error;
  return data as Event[];
}

export type NewEvent = Pick<Event, 'title' | 'date' | 'owner_id'> &
  Partial<Pick<Event, 'description' | 'start_time' | 'end_time' | 'visibility'>>;

export async function createEvent(input: NewEvent) {
  const { data, error } = await supabase.from('events').insert(input).select().single();
  if (error) throw error;
  return data as Event;
}

export async function deleteEvent(id: string) {
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) throw error;
}

export const VISIBILITY_LABELS: Record<EventVisibility, string> = {
  shared: 'Shared (whole team)',
  solo: 'Solo (just me)',
};
