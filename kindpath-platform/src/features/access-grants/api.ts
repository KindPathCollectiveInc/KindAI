import { supabase } from '@/lib/supabase';
import type { AccessGrant } from '@/types/database';

export async function listGrantsForPlan(planId: string) {
  const { data, error } = await supabase
    .from('access_grants')
    .select('*')
    .eq('specialist_plan_id', planId)
    .order('granted_at', { ascending: false });
  if (error) throw error;
  return data as AccessGrant[];
}

export async function createGrantForPlan(
  planId: string,
  granteeId: string,
  justification: string,
  approvedBy: string,
  expiresAt?: string | null,
) {
  const { data, error } = await supabase
    .from('access_grants')
    .insert({
      specialist_plan_id: planId,
      grantee_id: granteeId,
      scope_type: 'specific_plan',
      justification,
      approved_by: approvedBy,
      expires_at: expiresAt ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as AccessGrant;
}

export async function revokeGrant(id: string, revokedBy: string) {
  const { error } = await supabase
    .from('access_grants')
    .update({ revoked: true, revoked_at: new Date().toISOString(), revoked_by: revokedBy })
    .eq('id', id);
  if (error) throw error;
}
