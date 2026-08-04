import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { createPlan, listPlanTypes, SPECIALTY_LABELS } from '@/features/specialist-plans/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export function SpecialistPlanFormPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { data: planTypes, loading: typesLoading } = useAsync(listPlanTypes, []);

  const [planTypeId, setPlanTypeId] = useState('');
  const [operationalSummary, setOperationalSummary] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedType = planTypes?.find((t) => t.id === planTypeId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!clientId || !planTypeId) return;
    setSubmitting(true);
    setError(null);
    try {
      const plan = await createPlan({
        client_id: clientId,
        plan_type_id: planTypeId,
        operational_summary: operationalSummary,
      });
      navigate(`/plans/${plan.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-2 text-2xl font-semibold text-forest-700">New specialist plan</h1>
      <p className="mb-6 text-sm text-slate">
        Record the operational guidance here. The clinical reasoning behind it is added
        separately, and is only visible to the specialist engaged for this plan.
      </p>

      <form onSubmit={handleSubmit}>
        <Card className="space-y-4">
          <label className="block text-sm font-medium text-forest-700">
            Plan type
            <select
              required
              disabled={typesLoading}
              value={planTypeId}
              onChange={(e) => setPlanTypeId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
            >
              <option value="">Select a plan type…</option>
              {(planTypes ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {selectedType && (
              <p className="mt-1 text-xs text-slate">
                Authorised by: {SPECIALTY_LABELS[selectedType.responsible_specialty]}
              </p>
            )}
          </label>

          <label className="block text-sm font-medium text-forest-700">
            Operational summary
            <textarea
              required
              rows={5}
              value={operationalSummary}
              onChange={(e) => setOperationalSummary(e.target.value)}
              placeholder="What to do, what to avoid, who to call — visible to anyone supporting this client."
              className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
            />
          </label>

          {error && <p className="text-sm text-terracotta">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !planTypeId}>
              {submitting ? 'Saving…' : 'Create plan'}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
