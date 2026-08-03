import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import {
  getPerson,
  listOnboardingRecords,
  ONBOARDING_STEPS,
  upsertOnboardingRecord,
} from '@/features/people/api';
import type { OnboardingRecord, OnboardingStep } from '@/types/database';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthContext';

export function PersonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const canManage = profile && ['admin', 'care_advocacy'].includes(profile.role);
  const isSelf = profile?.id === id;

  const { data: person, loading: personLoading } = useAsync(() => getPerson(id!), [id]);
  const { data: records, reload } = useAsync(() => listOnboardingRecords(id), [id]);

  if (personLoading) return <p className="text-sm text-slate">Loading…</p>;
  if (!person) return <p className="text-sm text-terracotta">Person not found, or you don't have access.</p>;

  const recordFor = (step: OnboardingStep) => records?.find((r) => r.step === step);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-forest-700">{person.full_name}</h1>
          <p className="text-sm capitalize text-slate">{person.role.replace('_', ' ')}</p>
        </div>
      </div>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-forest-700">Onboarding checklist</h2>
        <div className="space-y-4">
          {ONBOARDING_STEPS.map((stepDef) => (
            <StepRow
              key={stepDef.key}
              personId={person.id}
              stepDef={stepDef}
              record={recordFor(stepDef.key)}
              editable={Boolean(canManage || isSelf)}
              onSaved={reload}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}

function StepRow({
  personId,
  stepDef,
  record,
  editable,
  onSaved,
}: {
  personId: string;
  stepDef: { key: OnboardingStep; label: string; hasExpiry: boolean };
  record?: OnboardingRecord;
  editable: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [completed, setCompleted] = useState(record?.completed ?? false);
  const [expiryDate, setExpiryDate] = useState(record?.expiry_date ?? '');
  const [saving, setSaving] = useState(false);

  const expiringSoon =
    stepDef.hasExpiry &&
    record?.expiry_date &&
    (new Date(record.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24) <= 90;

  async function save() {
    setSaving(true);
    try {
      await upsertOnboardingRecord({
        person_id: personId,
        step: stepDef.key,
        completed,
        completed_date: completed ? new Date().toISOString().slice(0, 10) : null,
        expiry_date: stepDef.hasExpiry && expiryDate ? expiryDate : null,
      });
      setEditing(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-b border-sand-100 pb-3 last:border-0 last:pb-0">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-forest-700">{stepDef.label}</p>
          {record?.expiry_date && (
            <p className="text-xs text-slate">
              Expires {new Date(record.expiry_date).toLocaleDateString('en-AU')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {expiringSoon && <Badge tone="terracotta">Expiring soon</Badge>}
          <Badge tone={record?.completed ? 'sage' : 'slate'}>
            {record?.completed ? 'Complete' : 'Incomplete'}
          </Badge>
          {editable && (
            <Button variant="ghost" onClick={() => setEditing((v) => !v)}>
              {editing ? 'Close' : 'Update'}
            </Button>
          )}
        </div>
      </div>

      {editing && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-sand-100 p-3">
          <label className="flex items-center gap-2 text-sm text-forest-700">
            <input type="checkbox" checked={completed} onChange={(e) => setCompleted(e.target.checked)} />
            Completed
          </label>
          {stepDef.hasExpiry && (
            <label className="flex items-center gap-2 text-sm text-forest-700">
              Expiry date
              <input
                type="date"
                value={expiryDate ?? ''}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="rounded-lg border border-sand-200 px-2 py-1 text-sm"
              />
            </label>
          )}
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}
    </div>
  );
}
