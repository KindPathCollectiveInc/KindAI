import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { addNote, getClient, getClientActivity } from '@/features/clients/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthContext';
import { ShareTokenPanel } from '@/features/share/ShareTokenPanel';
import { SpecialistPlansPanel } from '@/features/specialist-plans/SpecialistPlansPanel';
import { RequestDeletionButton } from '@/features/deletion-requests/RequestDeletionButton';
import { DocumentsPanel } from '@/features/documents/DocumentsPanel';

const kindLabel: Record<string, string> = {
  note: 'Case note',
  task: 'Task',
  document: 'Document',
  transaction: 'Finance',
};

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const { data: client, loading: clientLoading, error: clientError } = useAsync(
    () => getClient(id!),
    [id],
  );
  const {
    data: activity,
    loading: activityLoading,
    reload: reloadActivity,
  } = useAsync(() => getClientActivity(id!), [id]);

  const [noteText, setNoteText] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);

  const canEdit = profile && ['admin', 'care_advocacy', 'committee'].includes(profile.role);

  async function handleAddNote(e: FormEvent) {
    e.preventDefault();
    if (!id || !profile || !noteText.trim()) return;
    setSubmittingNote(true);
    try {
      await addNote(id, profile.id, noteText.trim());
      setNoteText('');
      reloadActivity();
    } finally {
      setSubmittingNote(false);
    }
  }

  if (clientLoading) return <p className="text-sm text-slate">Loading…</p>;
  if (clientError || !client) {
    return (
      <p className="text-sm text-terracotta">
        Couldn't load this client. You may not have access, or it may not exist.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-1 space-y-4">
        <Card>
          <div className="flex items-start justify-between">
            <h1 className="text-xl font-semibold text-forest-700">{client.name}</h1>
            <Badge tone={client.status === 'active' ? 'sage' : 'slate'}>{client.status}</Badge>
          </div>
          {client.ndis_number && <p className="mt-1 text-xs text-slate">NDIS {client.ndis_number}</p>}

          <dl className="mt-4 space-y-2 text-sm">
            <DetailRow label="Support coordinator" value={client.support_coordinator} />
            <DetailRow label="Plan end date" value={client.plan_end_date} />
            <DetailRow label="Phone" value={client.phone} />
            <DetailRow label="Address" value={client.address} />
            <DetailRow label="Emergency contact" value={client.emergency_contact} />
          </dl>

          {canEdit && (
            <Link to={`/clients/${client.id}/edit`} className="mt-4 inline-block">
              <Button variant="secondary">Edit details</Button>
            </Link>
          )}

          {profile?.role === 'admin' && (
            <div className="mt-4 border-t border-sand-100 pt-3">
              <RequestDeletionButton tableName="clients" recordId={client.id} />
            </div>
          )}
        </Card>

        {(client.care_plan || client.routines || client.communication_preferences || client.goals) && (
          <Card className="space-y-3 text-sm">
            <SectionText label="Care plan" value={client.care_plan} />
            <SectionText label="Routines" value={client.routines} />
            <SectionText label="Communication preferences" value={client.communication_preferences} />
            <SectionText label="Goals" value={client.goals} />
          </Card>
        )}

        <SpecialistPlansPanel clientId={client.id} />

        <DocumentsPanel clientId={client.id} />

        {canEdit && <ShareTokenPanel clientId={client.id} />}
      </div>

      <div className="lg:col-span-2 space-y-4">
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-forest-700">Add a case note</h2>
          <form onSubmit={handleAddNote} className="space-y-3">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={3}
              placeholder="What happened, what was observed, any follow-up needed…"
              className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm focus:border-forest focus:outline-none"
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={submittingNote || !noteText.trim()}>
                {submittingNote ? 'Saving…' : 'Add note'}
              </Button>
            </div>
          </form>
        </Card>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-forest-700">Activity</h2>
          {activityLoading && <p className="text-sm text-slate">Loading activity…</p>}
          {!activityLoading && (activity ?? []).length === 0 && (
            <Card>
              <p className="text-sm text-slate">Nothing recorded yet.</p>
            </Card>
          )}
          <div className="space-y-3">
            {(activity ?? []).map((item) => (
              <Card key={item.id}>
                <div className="flex items-center justify-between">
                  <Badge tone={toneFor(item.kind)}>{kindLabel[item.kind]}</Badge>
                  <span className="text-xs text-slate">
                    {new Date(item.at).toLocaleDateString('en-AU')}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium text-forest-700">{item.title}</p>
                {item.detail && <p className="mt-1 text-sm text-slate">{item.detail}</p>}
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function toneFor(kind: string) {
  switch (kind) {
    case 'note':
      return 'forest' as const;
    case 'task':
      return 'sage' as const;
    case 'document':
      return 'terracotta' as const;
    default:
      return 'slate' as const;
  }
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate">{label}</dt>
      <dd className="text-forest-700">{value}</dd>
    </div>
  );
}

function SectionText({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-forest-700">{value}</p>
    </div>
  );
}
