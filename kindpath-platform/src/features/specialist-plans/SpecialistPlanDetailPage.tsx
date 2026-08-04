import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import {
  getFormulation,
  getPlan,
  listPlanTypes,
  updatePlanOperationalSummary,
  updatePlanStatus,
  upsertFormulation,
} from '@/features/specialist-plans/api';
import type { SignoffStatus } from '@/types/database';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthContext';
import { AccessGrantsPanel } from '@/features/access-grants/AccessGrantsPanel';
import { RiskRatingPanel } from '@/features/plan-reviews/RiskRatingPanel';
import { PlanReviewsPanel } from '@/features/plan-reviews/PlanReviewsPanel';

const statusTone: Record<SignoffStatus, 'terracotta' | 'sage' | 'slate' | 'forest'> = {
  draft: 'slate',
  pending_authorisation: 'terracotta',
  authorised: 'sage',
  declined: 'terracotta',
  expired: 'terracotta',
};

export function SpecialistPlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const { data: plan, loading: planLoading, reload: reloadPlan } = useAsync(() => getPlan(id!), [id]);
  const { data: planTypes } = useAsync(listPlanTypes, []);
  const {
    data: formulation,
    loading: formulationLoading,
    reload: reloadFormulation,
  } = useAsync(() => getFormulation(id!), [id]);

  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState('');
  const [editingFormulation, setEditingFormulation] = useState(false);
  const [formulationDraft, setFormulationDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const canManage = profile && ['admin', 'care_advocacy'].includes(profile.role);
  const canAttemptFormulation = profile && ['admin', 'specialist'].includes(profile.role);

  if (planLoading) return <p className="text-sm text-slate">Loading…</p>;
  if (!plan) return <p className="text-sm text-terracotta">Plan not found, or you don't have access.</p>;

  const planType = planTypes?.find((t) => t.id === plan.plan_type_id);

  async function saveSummary() {
    if (!plan) return;
    setSaving(true);
    try {
      await updatePlanOperationalSummary(plan.id, summaryDraft);
      setEditingSummary(false);
      reloadPlan();
    } finally {
      setSaving(false);
    }
  }

  async function saveFormulation() {
    if (!plan) return;
    setSaving(true);
    try {
      await upsertFormulation(plan.id, formulationDraft, formulation?.id);
      setEditingFormulation(false);
      reloadFormulation();
    } finally {
      setSaving(false);
    }
  }

  async function transition(status: SignoffStatus) {
    if (!plan || !profile) return;
    await updatePlanStatus(plan.id, status, profile.id);
    reloadPlan();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate">{planType?.name ?? 'Plan'}</p>
            <h1 className="text-xl font-semibold text-forest-700">Operational summary</h1>
          </div>
          <Badge tone={statusTone[plan.status]}>{plan.status.replace('_', ' ')}</Badge>
        </div>

        {editingSummary ? (
          <div className="mt-3 space-y-3">
            <textarea
              rows={5}
              value={summaryDraft}
              onChange={(e) => setSummaryDraft(e.target.value)}
              className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditingSummary(false)}>
                Cancel
              </Button>
              <Button onClick={saveSummary} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-3 whitespace-pre-wrap text-sm text-forest-700">{plan.operational_summary}</p>
            {canManage && (
              <Button
                variant="ghost"
                className="mt-2"
                onClick={() => {
                  setSummaryDraft(plan.operational_summary);
                  setEditingSummary(true);
                }}
              >
                Edit
              </Button>
            )}
          </>
        )}

        {canManage && plan.status !== 'authorised' && plan.status !== 'declined' && (
          <div className="mt-4 flex gap-2 border-t border-sand-100 pt-3">
            {plan.status === 'draft' && (
              <Button variant="secondary" onClick={() => transition('pending_authorisation')}>
                Submit for authorisation
              </Button>
            )}
          </div>
        )}

        {canAttemptFormulation && plan.status === 'pending_authorisation' && (
          <div className="mt-4 flex gap-2 border-t border-sand-100 pt-3">
            <p className="text-xs text-slate">As the engaged specialist:</p>
            <Button variant="secondary" onClick={() => transition('authorised')}>
              Authorise
            </Button>
            <Button variant="ghost" onClick={() => transition('declined')}>
              Decline
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-forest-700">Clinical formulation</h2>
        <p className="mt-1 text-xs text-slate">
          Visible only to the engaged specialist, an admin, or someone with a specific access
          grant for this plan.
        </p>

        {formulationLoading && <p className="mt-3 text-sm text-slate">Loading…</p>}

        {!formulationLoading && editingFormulation && (
          <div className="mt-3 space-y-3">
            <textarea
              rows={5}
              value={formulationDraft}
              onChange={(e) => setFormulationDraft(e.target.value)}
              className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditingFormulation(false)}>
                Cancel
              </Button>
              <Button onClick={saveFormulation} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        )}

        {!formulationLoading && !editingFormulation && formulation && (
          <>
            <p className="mt-3 whitespace-pre-wrap text-sm text-forest-700">{formulation.formulation_detail}</p>
            {canAttemptFormulation && (
              <Button
                variant="ghost"
                className="mt-2"
                onClick={() => {
                  setFormulationDraft(formulation.formulation_detail);
                  setEditingFormulation(true);
                }}
              >
                Edit
              </Button>
            )}
          </>
        )}

        {!formulationLoading && !editingFormulation && !formulation && (
          <>
            <p className="mt-3 text-sm text-slate">
              Nothing recorded, or you don't have access to view it.
            </p>
            {canAttemptFormulation && (
              <Button
                variant="secondary"
                className="mt-2"
                onClick={() => {
                  setFormulationDraft('');
                  setEditingFormulation(true);
                }}
              >
                Add formulation
              </Button>
            )}
          </>
        )}
      </Card>

      <RiskRatingPanel planId={plan.id} />
      <PlanReviewsPanel planId={plan.id} />
      {canManage && <AccessGrantsPanel scope={{ specialistPlanId: plan.id }} />}
    </div>
  );
}
