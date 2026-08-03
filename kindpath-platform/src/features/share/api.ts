import { supabase } from '@/lib/supabase';
import type { ConsentScope, ShareTokenRow } from '@/types/database';

export async function listShareTokens(clientId: string) {
  const { data, error } = await supabase
    .from('share_tokens')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as ShareTokenRow[];
}

export async function createShareToken(clientId: string, scope: ConsentScope, expiresAt: string | null) {
  const { data, error } = await supabase
    .from('share_tokens')
    .insert({ client_id: clientId, scope, expires_at: expiresAt })
    .select()
    .single();
  if (error) throw error;
  return data as ShareTokenRow;
}

export async function revokeShareToken(id: string) {
  const { error } = await supabase.from('share_tokens').update({ revoked: true }).eq('id', id);
  if (error) throw error;
}
