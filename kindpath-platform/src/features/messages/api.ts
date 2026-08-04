import { supabase } from '@/lib/supabase';
import type { Message } from '@/types/database';

export async function listMessages() {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .order('date', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data as Message[];
}

export async function postMessage(authorId: string, text: string) {
  const { data, error } = await supabase
    .from('messages')
    .insert({ author_id: authorId, text })
    .select()
    .single();
  if (error) throw error;
  return data as Message;
}

export async function tagMessage(messageId: string, opts: { clientId?: string; profileId?: string }) {
  const { error } = await supabase
    .from('message_tags')
    .insert({ message_id: messageId, client_id: opts.clientId ?? null, profile_id: opts.profileId ?? null });
  if (error) throw error;
}
