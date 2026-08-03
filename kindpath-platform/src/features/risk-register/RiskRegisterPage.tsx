import { useState, type FormEvent } from 'react';
import { useAsync } from '@/hooks/useAsync';
import {
  RISK_CATEGORIES,
  RISK_LEVELS,
  createRisk,
  listRisks,
  riskScore,
  updateRisk,
} from '@/features/risk-register/api';
import type { RiskCategory, RiskLevel, RiskStatus } from '@/types/database';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

const statusTone: Record<RiskStatus, 'terracotta' | 'sage' | 'slate' | 'forest'> = {
  open: 'terracotta',
  monitoring: 'forest',
  mitigated: 'sage',
  closed: 'slate',
};

export function RiskRegisterPage() {
  const { data: risks, loading, reload } = useAsync(listRisks, []);
  const [showForm, setShowForm] = useState(false);

  const sorted = [...(risks ?? [])].sort((a, b) => riskScore(b) - riskScore(a));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-forest-700">Risk register</h1>
          <p className="max-w-2xl text-sm text-slate">
            Board/governance oversight document. This is a technical encoding of KindPath's
            adopted risk policy — the categories and defaults here should be reviewed and
            formally signed off, not treated as a legal determination made by the software.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Close' : 'Add risk'}</Button>
      </div>

      {showForm && (
        <RiskForm
          onCreated={() => {
            setShowForm(false);
            reload();
          }}
        />
      )}

      {loading && <p className="text-sm text-slate">Loading…</p>}

      <div className="space-y-3">
        {sorted.map((risk) => (
          <Card key={risk.id}>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Badge tone="slate">{RISK_CATEGORIES.find((c) => c.value === risk.category)?.label}</Badge>
                  <span className="text-sm font-medium text-forest-700">{risk.title}</span>
                </div>
                {risk.description && <p className="mt-2 text-sm text-slate">{risk.description}</p>}
                <p className="mt-1 text-xs text-slate">
                  Likelihood {risk.likelihood} · Impact {risk.impact} · Score {riskScore(risk)}
                </p>
                {risk.mitigation && (
                  <p className="mt-2 text-sm text-forest-700">
                    <span className="font-medium">Mitigation: </span>
                    {risk.mitigation}
                  </p>
                )}
              </div>
              <Badge tone={statusTone[risk.status]}>{risk.status}</Badge>
            </div>

            {risk.status !== 'closed' && (
              <div className="mt-3 flex gap-2 border-t border-sand-100 pt-3">
                {(['monitoring', 'mitigated', 'closed'] as const).map((next) => (
                  <Button
                    key={next}
                    variant="secondary"
                    onClick={() => updateRisk(risk.id, { status: next }).then(reload)}
                  >
                    Mark {next}
                  </Button>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function RiskForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<RiskCategory>('operational');
  const [likelihood, setLikelihood] = useState<RiskLevel>('medium');
  const [impact, setImpact] = useState<RiskLevel>('medium');
  const [description, setDescription] = useState('');
  const [mitigation, setMitigation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createRisk({
        title,
        category,
        likelihood,
        impact,
        description: description || null,
        mitigation: mitigation || null,
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
        <label className="block text-sm font-medium text-forest-700">
          Title
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
          />
        </label>

        <div className="grid grid-cols-3 gap-3">
          <label className="text-sm font-medium text-forest-700">
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as RiskCategory)}
              className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
            >
              {RISK_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-forest-700">
            Likelihood
            <select
              value={likelihood}
              onChange={(e) => setLikelihood(e.target.value as RiskLevel)}
              className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
            >
              {RISK_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-forest-700">
            Impact
            <select
              value={impact}
              onChange={(e) => setImpact(e.target.value as RiskLevel)}
              className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
            >
              {RISK_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-sm font-medium text-forest-700">
          Description
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
          />
        </label>

        <label className="block text-sm font-medium text-forest-700">
          Mitigation
          <textarea
            rows={2}
            value={mitigation}
            onChange={(e) => setMitigation(e.target.value)}
            className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
          />
        </label>

        {error && <p className="text-sm text-terracotta">{error}</p>}

        <div className="flex justify-end">
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Add risk'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
