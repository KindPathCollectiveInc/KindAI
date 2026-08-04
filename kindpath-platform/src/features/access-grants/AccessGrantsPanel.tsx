import { useState } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { createGrantForPlan, listGrantsForPlan, revokeGrant } from '@/features/access-grants/api';
import { listPeople } from '@/features/people/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthContext';

export function AccessGrantsPanel({ scope }: { scope: { specialistPlanId: string } }) {
  const { profile } = useAuth();
  const { data: grants, loading, reload } = useAsync(
    () => listGrantsForPlan(scope.specialistPlanId),
    [scope.specialistPlanId],
  );
  const { data: people } = useAsync(listPeople, []);

  const [granteeId, setGranteeId] = useState('');
  const [justification, setJustification] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!profile || !granteeId || !justification.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await createGrantForPlan(
        scope.specialistPlanId,
        granteeId,
        justification.trim(),
        profile.id,
        expiresAt || null,
      );
      setGranteeId('');
      setJustification('');
      setExpiresAt('');
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setCreating(false);
    }
  }

  const nameFor = (id: string) => people?.find((p) => p.id === id)?.full_name ?? id;

  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold text-forest-700">Formulation access grants</h2>
      <p className="mb-3 text-xs text-slate">
        Elevate a specific person's access to the clinical formulation above — scoped to this
        plan, with a required reason, revocable at any time. Use this to onboard a new worker
        onto a caseload rather than widening anyone's standing role.
      </p>

      <div className="mb-4 space-y-2 rounded-lg bg-sand-100 p-3">
        <select
          value={granteeId}
          onChange={(e) => setGranteeId(e.target.value)}
          className="w-full rounded-lg border border-sand-200 px-2 py-1.5 text-sm"
        >
          <option value="">Grant access to…</option>
          {(people ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name} ({p.role.replace('_', ' ')})
            </option>
          ))}
        </select>
        <textarea
          rows={2}
          placeholder="Justification (required) — why does this person need this?"
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          className="w-full rounded-lg border border-sand-200 px-2 py-1.5 text-sm"
        />
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate">
            Expires (optional)
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="ml-2 rounded-lg border border-sand-200 px-2 py-1 text-sm"
            />
          </label>
          <div className="flex-1" />
          <Button
            variant="secondary"
            onClick={handleCreate}
            disabled={creating || !granteeId || !justification.trim()}
          >
            {creating ? 'Granting…' : 'Grant access'}
          </Button>
        </div>
        {error && <p className="text-sm text-terracotta">{error}</p>}
      </div>

      {loading && <p className="text-sm text-slate">Loading…</p>}

      <div className="space-y-2">
        {(grants ?? []).map((g) => (
          <div key={g.id} className="rounded-lg border border-sand-100 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-forest-700">{nameFor(g.grantee_id)}</span>
              <Badge tone={g.revoked ? 'slate' : 'sage'}>{g.revoked ? 'Revoked' : 'Active'}</Badge>
            </div>
            <p className="mt-1 text-xs text-slate">{g.justification}</p>
            {g.expires_at && (
              <p className="mt-1 text-xs text-slate">
                Expires {new Date(g.expires_at).toLocaleDateString('en-AU')}
              </p>
            )}
            {!g.revoked && (
              <div className="mt-2 flex justify-end">
                <Button
                  variant="ghost"
                  onClick={() => profile && revokeGrant(g.id, profile.id).then(reload)}
                >
                  Revoke
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
