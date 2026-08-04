import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { listReviewsForPlan, scheduleReview } from '@/features/plan-reviews/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthContext';

const statusTone: Record<string, 'terracotta' | 'sage' | 'slate' | 'forest'> = {
  scheduled: 'forest',
  held: 'sage',
  overdue: 'terracotta',
  cancelled: 'slate',
};

export function PlanReviewsPanel({ planId }: { planId: string }) {
  const { profile } = useAuth();
  const { data: reviews, loading, reload } = useAsync(() => listReviewsForPlan(planId), [planId]);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const canManage = profile && ['admin', 'care_advocacy'].includes(profile.role);

  async function handleSchedule() {
    if (!scheduledDate) return;
    setScheduling(true);
    try {
      await scheduleReview({ specialist_plan_id: planId, scheduled_date: scheduledDate });
      setScheduledDate('');
      reload();
    } finally {
      setScheduling(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold text-forest-700">Reviews</h2>
      <p className="mb-3 text-xs text-slate">
        The mandatory, scheduled check on whether this plan is still needed — the record this
        module is built around.
      </p>

      {canManage && (
        <div className="mb-3 flex items-center gap-2">
          <input
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            className="rounded-lg border border-sand-200 px-2 py-1.5 text-sm"
          />
          <Button variant="secondary" onClick={handleSchedule} disabled={scheduling || !scheduledDate}>
            {scheduling ? 'Scheduling…' : 'Schedule review'}
          </Button>
        </div>
      )}

      {loading && <p className="text-sm text-slate">Loading…</p>}
      {!loading && (reviews ?? []).length === 0 && <p className="text-sm text-slate">No reviews yet.</p>}

      <div className="space-y-2">
        {(reviews ?? []).map((r) => (
          <Link
            key={r.id}
            to={`/reviews/${r.id}`}
            className="flex items-center justify-between rounded-lg border border-sand-100 px-3 py-2 hover:border-forest"
          >
            <div>
              <p className="text-sm font-medium text-forest-700">
                {new Date(r.scheduled_date).toLocaleDateString('en-AU')}
              </p>
              {r.outcome && <p className="text-xs text-slate">{r.outcome.replace('_', ' ')}</p>}
            </div>
            <Badge tone={statusTone[r.status]}>{r.status}</Badge>
          </Link>
        ))}
      </div>
    </Card>
  );
}
