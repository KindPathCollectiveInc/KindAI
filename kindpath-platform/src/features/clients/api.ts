import { supabase } from '@/lib/supabase';
import type { Client, DocumentRow, Note, Task, Transaction } from '@/types/database';

export async function listClients() {
  const { data, error } = await supabase.from('clients').select('*').order('name');
  if (error) throw error;
  return data as Client[];
}

export async function getClient(id: string) {
  const { data, error } = await supabase.from('clients').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Client;
}

export type NewClient = Pick<Client, 'name'> &
  Partial<
    Omit<Client, 'id' | 'organisation_id' | 'created_at' | 'updated_at' | 'name' | 'created_by'>
  >;

export async function createClient(input: NewClient) {
  const { data, error } = await supabase.from('clients').insert(input).select().single();
  if (error) throw error;
  return data as Client;
}

export async function updateClient(id: string, input: Partial<NewClient>) {
  const { data, error } = await supabase.from('clients').update(input).eq('id', id).select().single();
  if (error) throw error;
  return data as Client;
}

export interface ClientActivityItem {
  id: string;
  kind: 'note' | 'task' | 'document' | 'transaction';
  at: string;
  title: string;
  detail?: string | null;
}

export async function getClientActivity(clientId: string): Promise<ClientActivityItem[]> {
  const [notesRes, taskTagsRes, documentsRes, transactionsRes] = await Promise.all([
    supabase.from('notes').select('*').eq('client_id', clientId).order('date', { ascending: false }),
    supabase.from('task_tags').select('task_id').eq('client_id', clientId),
    supabase.from('documents').select('*').eq('client_id', clientId),
    supabase.from('transactions').select('*').eq('client_id', clientId),
  ]);

  const items: ClientActivityItem[] = [];

  if (!notesRes.error) {
    for (const n of (notesRes.data ?? []) as Note[]) {
      items.push({ id: `note-${n.id}`, kind: 'note', at: n.date, title: 'Case note', detail: n.text });
    }
  }

  const taskIds = (taskTagsRes.data ?? []).map((row) => row.task_id);
  if (!taskTagsRes.error && taskIds.length > 0) {
    const { data: tasks, error: tasksError } = await supabase.from('tasks').select('*').in('id', taskIds);
    if (!tasksError) {
      for (const t of (tasks ?? []) as Task[]) {
        items.push({
          id: `task-${t.id}`,
          kind: 'task',
          at: t.due_date ?? t.created_at,
          title: t.title,
          detail: t.description,
        });
      }
    }
  }

  if (!documentsRes.error) {
    for (const d of (documentsRes.data ?? []) as DocumentRow[]) {
      items.push({
        id: `document-${d.id}`,
        kind: 'document',
        at: d.created_at,
        title: d.title,
        detail: `${d.category.replace(/_/g, ' ')} — ${d.status.replace(/_/g, ' ')}`,
      });
    }
  }

  // transactions are financial (treasurer-only via RLS) — this query
  // simply returns nothing for callers without that access, which is
  // exactly the desired behaviour, not an error to handle specially.
  if (!transactionsRes.error) {
    for (const tx of (transactionsRes.data ?? []) as Transaction[]) {
      items.push({
        id: `transaction-${tx.id}`,
        kind: 'transaction',
        at: tx.date,
        title: `${tx.type === 'income' ? 'Income' : 'Expense'} — ${tx.category}`,
        detail: `$${tx.amount.toFixed(2)} (organisational funds)`,
      });
    }
  }

  return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export async function addNote(clientId: string, authorId: string, text: string) {
  const { data, error } = await supabase
    .from('notes')
    .insert({ client_id: clientId, author_id: authorId, text })
    .select()
    .single();
  if (error) throw error;
  return data as Note;
}
