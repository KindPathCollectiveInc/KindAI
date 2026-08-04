import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import {
  addEscalationUpdate,
  advanceEscalation,
  assignEscalation,
  ESCALATION_STAGES,
  getEscalation,
  listEscalationUpdates,
} from '@/features/escalations/api';
import { listPeople } from '@/features/people/api';
import type { EscalationStatus, Profile } from '@/types/database';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthContext';

const stageLabel: Record<EscalationStatus, string> = {
  raised: 'Raised',
  groundwork: 'Groundwork',
  risk_compliance_review: 'Risk & compliance review',
  ceo_reviewed: 'CEO/President reviewed',
  resolved: 'Resolved',
};

export function EscalationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const { data: escalation, loading, reload } = useAsync(() => getEscalation(id!), [id]);
  const { data: updates, reload: reloadUpdates } = useAsync(() => listEscalationUpdates(id!), [id]);
  const { data: people } = useAsync(listPeople, []);

  const [note, setNote] = useState('');
  const [posting, setPosting] = useState(false);

  const canAct =
    profile &&
    (profile.role === 'admin' ||
      profile.is_ceo_escalation_point ||
      profile.handles_risk_compliance ||
      profile.handles_participant_outcomes);

  const canDecide = profile && (profile.role === 'admin' || profile.is_ceo_escalation_point);

  if (loading) return <p className="text-sm text-slate">Loading…</p>;
  if (!escalation) return <p className="text-sm text-terracotta">Not found, or you don't have access.</p>;

  const nameFor = (pid: string | null) => (pid ? people?.find((p) => p.id === pid)?.full_name ?? pid : '—');
  const currentIndex = ESCALATION_STAGES.indexOf(escalation.status);
  const nextStage = ESCALATION_STAGES[currentIndex + 1];

  async function postUpdate() {
    if (!profile || !escalation || !note.trim()) return;
    setPosting(true);
    try {
      await addEscalationUpdate(escalation.id, profile.id, escalation.status, note.trim());
      setNote('');
      reloadUpdates();
    } finally {
      setPosting(false);
    }
  }

  async function moveToNextStage() {
    if (!escalation || !nextStage) return;
    await advanceEscalation(escalation.id, nextStage);
    reload();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <div className="flex items-start justify-between">
          <h1 className="text-xl font-semibold text-forest-700">{escalation.reason}</h1>
          <Badge tone={escalation.status === 'resolved' ? 'sage' : 'terracotta'}>
            {stageLabel[escalation.status]}
          </Badge>
        </div>

        <dl className="mt-3 space-y-1 text-sm">
          <div>
            <dt className="inline text-slate">Risk &amp; compliance owner: </dt>
            <dd className="inline text-forest-700">{nameFor(escalation.risk_compliance_owner)}</dd>
          </div>
          <div>
            <dt className="inline text-slate">Participant outcomes owner: </dt>
            <dd className="inline text-forest-700">{nameFor(escalation.participant_outcomes_owner)}</dd>
          </div>
          <div>
            <dt className="inline text-slate">CEO/President: </dt>
            <dd className="inline text-forest-700">{nameFor(escalation.ceo_id)}</dd>
          </div>
        </dl>

        {canAct && (
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-sand-100 pt-3">
            <AssignSelect
              label="Risk & compliance"
              people={people ?? []}
              value={escalation.risk_compliance_owner}
              onChange={(v) => assignEscalation(escalation.id, { risk_compliance_owner: v }).then(reload)}
              filter={(p) => p.handles_risk_compliance || p.role === 'admin'}
            />
            <AssignSelect
              label="Participant outcomes"
              people={people ?? []}
              value={escalation.participant_outcomes_owner}
              onChange={(v) => assignEscalation(escalation.id, { participant_outcomes_owner: v }).then(reload)}
              filter={(p) => p.handles_participant_outcomes || p.role === 'admin'}
            />
            <AssignSelect
              label="CEO/President"
              people={people ?? []}
              value={escalation.ceo_id}
              onChange={(v) => assignEscalation(escalation.id, { ceo_id: v }).then(reload)}
              filter={(p) => p.is_ceo_escalation_point || p.role === 'admin'}
            />
          </div>
        )}

        {canDecide && nextStage && (
          <div className="mt-4 flex justify-end border-t border-sand-100 pt-3">
            <Button variant="secondary" onClick={moveToNextStage}>
              Advance to: {stageLabel[nextStage]}
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-forest-700">
          Trail — CEO/President visibility at every stage
        </h2>

        <div className="space-y-3">
          {(updates ?? []).map((u) => (
            <div key={u.id} className="border-b border-sand-100 pb-2 last:border-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-forest-700">{nameFor(u.author_id)}</span>
                <span className="text-xs text-slate">{stageLabel[u.stage]}</span>
              </div>
              <p className="mt-1 text-sm text-forest-700">{u.note}</p>
              <p className="text-xs text-slate">{new Date(u.created_at).toLocaleString('en-AU')}</p>
            </div>
          ))}
          {(updates ?? []).length === 0 && <p className="text-sm text-slate">No updates yet.</p>}
        </div>

        {canAct && (
          <div className="mt-4 space-y-2 border-t border-sand-100 pt-3">
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add an update…"
              className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
            />
            <div className="flex justify-end">
              <Button onClick={postUpdate} disabled={posting || !note.trim()}>
                {posting ? 'Posting…' : 'Post update'}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function AssignSelect({
  label,
  people,
  value,
  onChange,
  filter,
}: {
  label: string;
  people: Profile[];
  value: string | null;
  onChange: (id: string) => void;
  filter: (p: Profile) => boolean;
}) {
  const options = people.filter(filter);
  return (
    <label className="text-xs font-medium text-forest-700">
      {label}
      <select
        value={value ?? ''}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-sand-200 px-2 py-1.5 text-xs"
      >
        <option value="">Unassigned</option>
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.full_name}
          </option>
        ))}
      </select>
    </label>
  );
}
