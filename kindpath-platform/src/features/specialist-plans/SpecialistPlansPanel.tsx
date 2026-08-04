import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { listPlansForClient, listPlanTypes } from '@/features/specialist-plans/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthContext';

const statusTone: Record<string, 'terracotta' | 'sage' | 'slate' | 'forest'> = {
  draft: 'slate',
  pending_authorisation: 'terracotta',
  authorised: 'sage',
  declined: 'terracotta',
  expired: 'terracotta',
};

export function SpecialistPlansPanel({ clientId }: { clientId: string }) {
  const { profile } = useAuth();
  const { data: plans, loading } = useAsync(() => listPlansForClient(clientId), [clientId]);
  const { data: planTypes } = useAsync(listPlanTypes, []);
  const canCreate = profile && ['admin', 'care_advocacy'].includes(profile.role);

  const typeName = (id: string) => planTypes?.find((t) => t.id === id)?.name ?? 'Plan';

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-forest-700">Specialist plans</h2>
        {canCreate && (
          <Link to={`/clients/${clientId}/plans/new`}>
            <Button variant="secondary">Add plan</Button>
          </Link>
        )}
      </div>

      <p className="mb-3 text-xs text-slate">
        Operational guidance is visible here to anyone supporting this client. The clinical
        reasoning behind each plan is only visible to the specialist engaged for it, or someone
        specifically granted access.
      </p>

      {loading && <p className="text-sm text-slate">Loading…</p>}
      {!loading && (plans ?? []).length === 0 && <p className="text-sm text-slate">No specialist plans yet.</p>}

      <div className="space-y-2">
        {(plans ?? []).map((plan) => (
          <Link
            key={plan.id}
            to={`/plans/${plan.id}`}
            className="flex items-center justify-between rounded-lg border border-sand-100 px-3 py-2 hover:border-forest"
          >
            <div>
              <p className="text-sm font-medium text-forest-700">{typeName(plan.plan_type_id)}</p>
              <p className="mt-0.5 line-clamp-1 text-xs text-slate">{plan.operational_summary}</p>
            </div>
            <Badge tone={statusTone[plan.status]}>{plan.status.replace('_', ' ')}</Badge>
          </Link>
        ))}
      </div>
    </Card>
  );
}
