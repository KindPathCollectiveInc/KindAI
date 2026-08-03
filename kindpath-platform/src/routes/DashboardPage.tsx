import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { listExpiringScreenings, ONBOARDING_STEPS } from '@/features/people/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/features/auth/AuthContext';

export function DashboardPage() {
  const { profile } = useAuth();
  const { data: expiring, loading } = useAsync(listExpiringScreenings, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-forest-700">
        Welcome back{profile ? `, ${profile.full_name.split(' ')[0]}` : ''}
      </h1>
      <p className="mb-6 text-sm text-slate">Here's what needs attention today.</p>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-forest-700">
          Screening &amp; WWCC expiry alerts
        </h2>

        {loading && <p className="text-sm text-slate">Checking…</p>}
        {!loading && (expiring ?? []).length === 0 && (
          <p className="text-sm text-slate">
            Nothing expiring in the next {90} days. All clear.
          </p>
        )}

        <div className="space-y-2">
          {(expiring ?? []).map((item) => {
            const label = ONBOARDING_STEPS.find((s) => s.key === item.step)?.label ?? item.step;
            const overdue = item.daysRemaining < 0;
            return (
              <Link
                key={`${item.personId}-${item.step}`}
                to={`/people/${item.personId}`}
                className="flex items-center justify-between rounded-lg border border-sand-100 px-3 py-2 hover:border-forest"
              >
                <div>
                  <p className="text-sm font-medium text-forest-700">{item.personName}</p>
                  <p className="text-xs text-slate">{label}</p>
                </div>
                <Badge tone="terracotta">
                  {overdue
                    ? `Overdue by ${Math.abs(item.daysRemaining)}d`
                    : `Due in ${item.daysRemaining}d`}
                </Badge>
              </Link>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
