import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { listEscalations, raiseEscalation } from '@/features/escalations/api';
import { listClients } from '@/features/clients/api';
import type { EscalationStatus } from '@/types/database';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthContext';

const statusTone: Record<EscalationStatus, 'terracotta' | 'sage' | 'slate' | 'forest'> = {
  raised: 'terracotta',
  groundwork: 'forest',
  risk_compliance_review: 'forest',
  ceo_reviewed: 'slate',
  resolved: 'sage',
};

export function EscalationsPage() {
  const { data: escalations, loading, reload } = useAsync(listEscalations, []);
  const { data: clients } = useAsync(listClients, []);
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-forest-700">Escalations</h1>
          <p className="max-w-2xl text-sm text-slate">
            A staged process, not a single notification — groundwork happens with risk &amp;
            compliance and participant outcomes, with the CEO/President having visibility at
            every stage and final decision authority.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Close' : 'Raise escalation'}</Button>
      </div>

      {showForm && (
        <RaiseForm
          clientOptions={(clients ?? []).map((c) => ({ id: c.id, name: c.name }))}
          onCreated={() => {
            setShowForm(false);
            reload();
          }}
        />
      )}

      {loading && <p className="text-sm text-slate">Loading…</p>}

      <div className="space-y-2">
        {(escalations ?? []).map((e) => (
          <Link
            key={e.id}
            to={`/escalations/${e.id}`}
            className="flex items-center justify-between rounded-lg border border-sand-100 bg-white px-4 py-3 hover:border-forest"
          >
            <div>
              <p className="text-sm font-medium text-forest-700">{e.reason}</p>
              <p className="text-xs text-slate">{new Date(e.created_at).toLocaleDateString('en-AU')}</p>
            </div>
            <Badge tone={statusTone[e.status]}>{e.status.replace(/_/g, ' ')}</Badge>
          </Link>
        ))}
      </div>
    </div>
  );
}

function RaiseForm({
  clientOptions,
  onCreated,
}: {
  clientOptions: { id: string; name: string }[];
  onCreated: () => void;
}) {
  const { profile } = useAuth();
  const [reason, setReason] = useState('');
  const [clientId, setClientId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSubmitting(true);
    try {
      await raiseEscalation({ reason, raised_by: profile.id, client_id: clientId || undefined });
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mb-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block text-sm font-medium text-forest-700">
          Related client (optional)
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
          >
            <option value="">None</option>
            {clientOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-forest-700">
          What needs to be escalated?
          <textarea
            required
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
          />
        </label>
        <div className="flex justify-end">
          <Button type="submit" disabled={submitting || !reason.trim()}>
            {submitting ? 'Submitting…' : 'Raise escalation'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
