import { useState } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { createShareToken, listShareTokens, revokeShareToken } from '@/features/share/api';
import type { ConsentScope } from '@/types/database';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

const scopeLabel: Record<ConsentScope, string> = {
  routines_only: 'Routines only',
  routines_and_comms: 'Routines + communication preferences',
  full_summary: 'Full summary (routines, comms, goals, care plan)',
};

export function ShareTokenPanel({ clientId }: { clientId: string }) {
  const { data: tokens, loading, reload } = useAsync(() => listShareTokens(clientId), [clientId]);
  const [scope, setScope] = useState<ConsentScope>('routines_and_comms');
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    setCreating(true);
    try {
      await createShareToken(clientId, scope, null);
      reload();
    } finally {
      setCreating(false);
    }
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold text-forest-700">External share links</h2>
      <p className="mb-3 text-xs text-slate">
        Generates a read-only, unauthenticated link showing only the coordinated summary fields
        allowed by the chosen scope. Revoke a link at any time to cut off access immediately.
      </p>

      <div className="mb-4 flex items-center gap-2">
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as ConsentScope)}
          className="rounded-lg border border-sand-200 px-2 py-1.5 text-sm"
        >
          {Object.entries(scopeLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Button variant="secondary" onClick={handleCreate} disabled={creating}>
          {creating ? 'Creating…' : 'Create link'}
        </Button>
      </div>

      {loading && <p className="text-sm text-slate">Loading…</p>}

      <div className="space-y-2">
        {(tokens ?? []).map((t) => (
          <div key={t.id} className="rounded-lg border border-sand-100 p-3 text-sm">
            <div className="flex items-center justify-between">
              <Badge tone={t.revoked ? 'slate' : 'sage'}>{t.revoked ? 'Revoked' : 'Active'}</Badge>
              <span className="text-xs text-slate">{scopeLabel[t.scope]}</span>
            </div>
            {!t.revoked && (
              <>
                <p className="mt-2 break-all font-mono text-xs text-forest-700">
                  {origin}/share/{t.token}
                </p>
                <div className="mt-2 flex justify-end">
                  <Button variant="ghost" onClick={() => revokeShareToken(t.id).then(reload)}>
                    Revoke
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
