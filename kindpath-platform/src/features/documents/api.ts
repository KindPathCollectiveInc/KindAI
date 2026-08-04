import { supabase } from '@/lib/supabase';
import type { DocumentCategory, DocumentRow, DocumentStatus } from '@/types/database';

export async function listDocumentsForClient(clientId: string) {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as DocumentRow[];
}

export async function listOrgDocuments() {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .is('client_id', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as DocumentRow[];
}

export type NewDocument = Pick<DocumentRow, 'title' | 'category' | 'uploader_id'> &
  Partial<Pick<DocumentRow, 'client_id' | 'notes'>>;

export async function createDocument(input: NewDocument) {
  const { data, error } = await supabase.from('documents').insert(input).select().single();
  if (error) throw error;
  return data as DocumentRow;
}

// Path convention: {organisation_id}/{document_id}/{filename} — matches
// the storage RLS policies, which resolve access by joining back to this
// document's row (see supabase/migrations/..._share_summary_and_storage.sql).
export async function uploadDocumentFile(doc: DocumentRow, file: File) {
  const path = `${doc.organisation_id}/${doc.id}/${file.name}`;
  const { error: uploadError } = await supabase.storage.from('documents').upload(path, file, {
    upsert: true,
  });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('documents')
    .update({ file_path: path })
    .eq('id', doc.id)
    .select()
    .single();
  if (error) throw error;
  return data as DocumentRow;
}

export async function getDocumentFileUrl(path: string) {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, 60 * 5);
  if (error) throw error;
  return data.signedUrl;
}

export async function updateDocumentStatus(id: string, status: DocumentStatus, approverId?: string) {
  const patch: Partial<Pick<DocumentRow, 'status' | 'approver_id'>> = { status };
  if (status === 'approved' && approverId) patch.approver_id = approverId;
  const { data, error } = await supabase.from('documents').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data as DocumentRow;
}

export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  care_plan: 'Care plan',
  bsp_risk_plan: 'BSP / Risk Plan',
  consent_form: 'Consent form',
  service_agreement: 'Service agreement',
  policy: 'Policy',
  correspondence: 'Correspondence',
  other: 'Other',
};
