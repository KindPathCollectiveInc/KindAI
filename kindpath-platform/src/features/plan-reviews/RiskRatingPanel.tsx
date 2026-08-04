import { useState } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { listCadenceRules, listRiskRatings, RISK_LEVELS, setRiskRating } from '@/features/plan-reviews/api';
import type { RiskLevel } from '@/types/database';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthContext';

const tierTone: Record<RiskLevel, 'sage' | 'forest' | 'terracotta'> = {
  low: 'sage',
  medium: 'forest',
  high: 'terracotta',
  critical: 'terracotta',
};

export function RiskRatingPanel({ planId }: { planId: string }) {
  const { profile } = useAuth();
  const { data: ratings, loading, reload } = useAsync(() => listRiskRatings(planId), [planId]);
  const { data: cadence } = useAsync(listCadenceRules, []);

  const [tier, setTier] = useState<RiskLevel>('medium');
  const [rationale, setRationale] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const current = ratings?.[0];
  const intervalForTier = (t: RiskLevel) => cadence?.find((c) => c.tier === t)?.interval_months;

  async function handleSetRating() {
    if (!profile) return;
    setSaving(true);
    try {
      await setRiskRating({
        specialist_plan_id: planId,
        tier,
        rationale: rationale.trim() || null,
        set_by: profile.id,
      });
      setRationale('');
      setShowForm(false);
      reload();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-forest-700">Risk rating &amp; review cadence</h2>
        {current && <Badge tone={tierTone[current.tier]}>{current.tier}</Badge>}
      </div>

      {loading && <p className="text-sm text-slate">Loading…</p>}

      {!loading && !current && <p className="text-sm text-slate">No risk rating set yet.</p>}

      {current && (
        <p className="text-xs text-slate">
          Set {new Date(current.created_at).toLocaleDateString('en-AU')} ·{' '}
          {current.source === 'clinical_override' ? 'Clinical override' : 'Suggested'}
          {intervalForTier(current.tier) && ` · review every ${intervalForTier(current.tier)} month(s)`}
        </p>
      )}
      {current?.rationale && <p className="mt-1 text-sm text-forest-700">{current.rationale}</p>}

      {!showForm ? (
        <Button variant="ghost" className="mt-2" onClick={() => setShowForm(true)}>
          Set / override rating
        </Button>
      ) : (
        <div className="mt-3 space-y-2 rounded-lg bg-sand-100 p-3">
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value as RiskLevel)}
            className="w-full rounded-lg border border-sand-200 px-2 py-1.5 text-sm"
          >
            {RISK_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <textarea
            rows={2}
            placeholder="Rationale (required if this overrides a previous rating)"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            className="w-full rounded-lg border border-sand-200 px-2 py-1.5 text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button onClick={handleSetRating} disabled={saving}>
              {saving ? 'Saving…' : 'Save rating'}
            </Button>
          </div>
        </div>
      )}

      {(ratings ?? []).length > 1 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-slate">History</summary>
          <div className="mt-2 space-y-1">
            {ratings!.slice(1).map((r) => (
              <p key={r.id} className="text-xs text-slate">
                {new Date(r.created_at).toLocaleDateString('en-AU')} — {r.tier}
                {r.rationale ? `: ${r.rationale}` : ''}
              </p>
            ))}
          </div>
        </details>
      )}
    </Card>
  );
}
