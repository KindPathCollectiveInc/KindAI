import { useState, type FormEvent } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { createTransaction, listTransactions, summarise, TYPE_LABELS } from '@/features/finances/api';
import type { TransactionType } from '@/types/database';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export function FinancesPage() {
  const { data: transactions, loading, reload, error } = useAsync(listTransactions, []);
  const [showForm, setShowForm] = useState(false);

  const totals = summarise(transactions ?? []);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-2">
        <h1 className="text-2xl font-semibold text-forest-700">Finances</h1>
        <p className="rounded-lg bg-clay px-3 py-2 text-sm text-terracotta">
          Organisational money only — this is not participant funds or NDIS plan management, and
          never will be in this screen.
        </p>
      </div>

      {error && (
        <Card className="mt-4">
          <p className="text-sm text-slate">
            You don't have access to financial data. This is restricted to admin and whoever
            holds the treasurer flag on the People page.
          </p>
        </Card>
      )}

      {!error && (
        <>
          <div className="my-4 grid grid-cols-3 gap-3">
            <Card className="text-center">
              <p className="text-xs text-slate">Income</p>
              <p className="text-lg font-semibold text-sage-700">${totals.income.toFixed(2)}</p>
            </Card>
            <Card className="text-center">
              <p className="text-xs text-slate">Expenses</p>
              <p className="text-lg font-semibold text-terracotta">${totals.expense.toFixed(2)}</p>
            </Card>
            <Card className="text-center">
              <p className="text-xs text-slate">Net</p>
              <p className="text-lg font-semibold text-forest-700">${totals.net.toFixed(2)}</p>
            </Card>
          </div>

          <div className="mb-4 flex justify-end">
            <Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Close' : 'Add transaction'}</Button>
          </div>

          {showForm && (
            <TransactionForm
              onCreated={() => {
                setShowForm(false);
                reload();
              }}
            />
          )}

          {loading && <p className="text-sm text-slate">Loading…</p>}

          <div className="space-y-2">
            {(transactions ?? []).map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg border border-sand-100 px-3 py-2">
                <div>
                  <p className="text-sm text-forest-700">{t.category}</p>
                  <p className="text-xs text-slate">{new Date(t.date).toLocaleDateString('en-AU')}</p>
                </div>
                <div className="text-right">
                  <Badge tone={t.type === 'income' ? 'sage' : 'terracotta'}>{TYPE_LABELS[t.type]}</Badge>
                  <p className="mt-1 text-sm font-medium text-forest-700">${t.amount.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TransactionForm({ onCreated }: { onCreated: () => void }) {
  const [type, setType] = useState<TransactionType>('expense');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createTransaction({
        type,
        category,
        amount: Number(amount),
        date,
        description: description || null,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mb-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-forest-700">
            Type
            <select
              value={type}
              onChange={(e) => setType(e.target.value as TransactionType)}
              className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
            >
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-forest-700">
            Amount ($)
            <input
              required
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-forest-700">
            Category
            <input
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. fuel, office supplies"
              className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium text-forest-700">
            Date
            <input
              required
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <label className="block text-sm font-medium text-forest-700">
          Description
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
          />
        </label>
        {error && <p className="text-sm text-terracotta">{error}</p>}
        <div className="flex justify-end">
          <Button type="submit" disabled={submitting || !category.trim() || !amount}>
            {submitting ? 'Saving…' : 'Add transaction'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
