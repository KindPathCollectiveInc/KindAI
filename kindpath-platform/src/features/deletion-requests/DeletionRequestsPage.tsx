import { useState } from 'react';
import { useAsync } from '@/hooks/useAsync';
import {
  approveDeletionRequest,
  declineDeletionRequest,
  DELETABLE_TABLE_LABELS,
  listDeletionRequests,
} from '@/features/deletion-requests/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthContext';

export function DeletionRequestsPage() {
  const { profile } = useAuth();
  const { data: requests, loading, reload } = useAsync(listDeletionRequests, []);
  const canDecide = profile && (profile.role === 'admin' || profile.is_ceo_escalation_point);
  const [error, setError] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [decisionNote, setDecisionNote] = useState('');

  async function handleApprove(id: string) {
    setError(null);
    try {
      await approveDeletionRequest(id);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  async function handleDecline(id: string) {
    setError(null);
    try {
      await declineDeletionRequest(id, decisionNote.trim() || 'Declined.');
      setDecliningId(null);
      setDecisionNote('');
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  const pending = (requests ?? []).filter((r) => r.status === 'pending');
  const decided = (requests ?? []).filter((r) => r.status !== 'pending');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-forest-700">Deletion requests</h1>
        <p className="max-w-2xl text-sm text-slate">
          Nothing substantial is deleted without oversight — every request here needs a
          CEO/President-flagged decision. Approving one permanently removes the record; there is
          no other way to delete these record types.
        </p>
      </div>

      {loading && <p className="text-sm text-slate">Loading…</p>}
      {error && <p className="mb-3 text-sm text-terracotta">{error}</p>}

      <h2 className="mb-2 text-sm font-semibold text-forest-700">Pending ({pending.length})</h2>
      <div className="mb-6 space-y-3">
        {pending.length === 0 && <p className="text-sm text-slate">Nothing pending.</p>}
        {pending.map((r) => (
          <Card key={r.id}>
            <div className="flex items-start justify-between">
              <div>
                <Badge tone="slate">{DELETABLE_TABLE_LABELS[r.table_name]}</Badge>
                <p className="mt-2 text-sm text-forest-700">{r.reason}</p>
                <p className="mt-1 text-xs text-slate">{new Date(r.created_at).toLocaleString('en-AU')}</p>
              </div>
            </div>

            {canDecide && (
              <div className="mt-3 border-t border-sand-100 pt-3">
                {decliningId === r.id ? (
                  <div className="space-y-2">
                    <textarea
                      rows={2}
                      placeholder="Reason for declining"
                      value={decisionNote}
                      onChange={(e) => setDecisionNote(e.target.value)}
                      className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => setDecliningId(null)}>
                        Cancel
                      </Button>
                      <Button variant="danger" onClick={() => handleDecline(r.id)}>
                        Confirm decline
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setDecliningId(r.id)}>
                      Decline
                    </Button>
                    <Button variant="danger" onClick={() => handleApprove(r.id)}>
                      Approve &amp; delete permanently
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>

      <h2 className="mb-2 text-sm font-semibold text-forest-700">Decided</h2>
      <div className="space-y-2">
        {decided.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-lg border border-sand-100 px-3 py-2">
            <div>
              <p className="text-sm text-forest-700">
                {DELETABLE_TABLE_LABELS[r.table_name]} — {r.reason}
              </p>
              {r.decision_note && <p className="text-xs text-slate">{r.decision_note}</p>}
            </div>
            <Badge tone={r.status === 'approved' ? 'terracotta' : 'sage'}>{r.status}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
