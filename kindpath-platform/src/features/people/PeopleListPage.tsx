import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { listOnboardingRecords, listPeople } from '@/features/people/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export function PeopleListPage() {
  const { data: people, loading, error } = useAsync(listPeople, []);
  const { data: records } = useAsync(() => listOnboardingRecords(), []);

  const screeningStatus = (personId: string) => {
    const wwcc = records?.find((r) => r.person_id === personId && r.step === 'wwcc');
    const ndis = records?.find((r) => r.person_id === personId && r.step === 'ndis_screening');
    const flags: string[] = [];
    for (const [label, rec] of [
      ['WWCC', wwcc],
      ['NDIS screening', ndis],
    ] as const) {
      if (!rec?.completed) flags.push(`${label} incomplete`);
      else if (rec.expiry_date && isWithinDays(rec.expiry_date, 90)) flags.push(`${label} expiring soon`);
    }
    return flags;
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-forest-700">People</h1>
        <p className="text-sm text-slate">
          Staff, committee members, and contractors — with screening/WWCC status at a glance.
        </p>
      </div>

      {loading && <p className="text-sm text-slate">Loading…</p>}
      {error && <p className="text-sm text-terracotta">{error}</p>}

      <div className="space-y-2">
        {(people ?? []).map((person) => {
          const flags = screeningStatus(person.id);
          return (
            <Link key={person.id} to={`/people/${person.id}`}>
              <Card className="flex items-center justify-between transition hover:border-forest">
                <div>
                  <p className="font-medium text-forest-700">{person.full_name}</p>
                  <p className="text-xs capitalize text-slate">{person.role.replace('_', ' ')}</p>
                </div>
                <div className="flex gap-2">
                  {flags.length === 0 ? (
                    <Badge tone="sage">Compliant</Badge>
                  ) : (
                    flags.map((flag) => (
                      <Badge key={flag} tone="terracotta">
                        {flag}
                      </Badge>
                    ))
                  )}
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function isWithinDays(dateStr: string, days: number) {
  const diff = (new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return diff <= days;
}
