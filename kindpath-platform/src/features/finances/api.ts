import { supabase } from '@/lib/supabase';
import type { Transaction, TransactionType } from '@/types/database';

export async function listTransactions() {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .order('date', { ascending: false });
  if (error) throw error;
  return data as Transaction[];
}

export type NewTransaction = Pick<Transaction, 'type' | 'category' | 'amount'> &
  Partial<Pick<Transaction, 'date' | 'description' | 'client_id' | 'staff_id'>>;

export async function createTransaction(input: NewTransaction) {
  const { data, error } = await supabase.from('transactions').insert(input).select().single();
  if (error) throw error;
  return data as Transaction;
}

export function summarise(transactions: Transaction[]) {
  const income = transactions.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const expense = transactions.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  return { income, expense, net: income - expense };
}

export const TYPE_LABELS: Record<TransactionType, string> = {
  income: 'Income',
  expense: 'Expense',
};
