import { useState, type FormEvent } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/features/auth/AuthContext';
import { listClients } from '@/features/clients/api';
import {
  INCIDENT_CATEGORIES,
  createIncident,
  listIncidents,
  updateIncident,
} from '@/features/incidents/api';
import type { IncidentCategory, IncidentStatus } from '@/types/database';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

const statusTone: Record<IncidentStatus, 'terracotta' | 'sage' | 'slate' | 'forest'> = {
  open: 'terracotta',
  notified: 'forest',
  under_review: 'slate',
  closed: 'sage',
};

export function IncidentsPage() {
  const { profile } = useAuth();
  const { data: incidents, loading, reload } = useAsync(listIncidents, []);
  const { data: clients } = useAsync(listClients, []);
  const [showForm, setShowForm] = useState(false);
  const canReview = profile && ['admin', 'care_advocacy'].includes(profile.role);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-forest-700">Reportable incidents</h1>
          <p className="max-w-2xl text-sm text-slate">
            Covers NDIS Commission reportable-incident categories as well as WHS and
            property/security events. Anyone can lodge a report; the register itself is visible
            to coordination and governance roles.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Close' : 'Report incident'}</Button>
      </div>

      {showForm && (
        <IncidentForm
          clientOptions={(clients ?? []).map((c) => ({ id: c.id, name: c.name }))}
          onCreated={() => {
            setShowForm(false);
            reload();
          }}
        />
      )}

      {loading && <p className="text-sm text-slate">Loading…</p>}

      <div className="mt-4 space-y-3">
        {(incidents ?? []).map((incident) => (
          <Card key={incident.id}>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Badge tone="slate">{incident.domain.replace(/_/g, ' ')}</Badge>
                  <span className="text-sm font-medium text-forest-700">
                    {INCIDENT_CATEGORIES.find((c) => c.value === incident.category)?.label ??
                      incident.category}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate">{incident.description}</p>
                <p className="mt-1 text-xs text-slate">
                  {new Date(incident.incident_at).toLocaleString('en-AU')}
                </p>
              </div>
              <Badge tone={statusTone[incident.status]}>{incident.status.replace('_', ' ')}</Badge>
            </div>

            {canReview && incident.status !== 'closed' && (
              <div className="mt-3 flex gap-2 border-t border-sand-100 pt-3">
                {incident.status === 'open' && (
                  <Button
                    variant="secondary"
                    onClick={() => updateIncident(incident.id, { status: 'under_review' }).then(reload)}
                  >
                    Mark under review
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => updateIncident(incident.id, { status: 'notified', notified_at: new Date().toISOString() }).then(reload)}
                >
                  Mark notified
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => updateIncident(incident.id, { status: 'closed', closed_at: new Date().toISOString() }).then(reload)}
                >
                  Close
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function IncidentForm({
  clientOptions,
  onCreated,
}: {
  clientOptions: { id: string; name: string }[];
  onCreated: () => void;
}) {
  const { profile } = useAuth();
  const [category, setCategory] = useState<IncidentCategory>('near_miss');
  const [clientId, setClientId] = useState('');
  const [incidentAt, setIncidentAt] = useState(new Date().toISOString().slice(0, 16));
  const [description, setDescription] = useState('');
  const [immediateAction, setImmediateAction] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSubmitting(true);
    setError(null);
    try {
      const domain = INCIDENT_CATEGORIES.find((c) => c.value === category)?.domain ?? 'other';
      await createIncident({
        category,
        domain,
        client_id: clientId || null,
        reported_by: profile.id,
        incident_at: new Date(incidentAt).toISOString(),
        description,
        immediate_action_taken: immediateAction || null,
        is_ndis_reportable: domain === 'ndis_reportable',
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
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-forest-700">
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as IncidentCategory)}
              className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
            >
              {INCIDENT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-forest-700">
            Related client (optional)
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
            >
              <option value="">None</option>
              {clientOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-sm font-medium text-forest-700">
          When did it happen?
          <input
            type="datetime-local"
            required
            value={incidentAt}
            onChange={(e) => setIncidentAt(e.target.value)}
            className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
          />
        </label>

        <label className="block text-sm font-medium text-forest-700">
          What happened?
          <textarea
            required
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
          />
        </label>

        <label className="block text-sm font-medium text-forest-700">
          Immediate action taken
          <textarea
            rows={2}
            value={immediateAction}
            onChange={(e) => setImmediateAction(e.target.value)}
            className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
          />
        </label>

        {error && <p className="text-sm text-terracotta">{error}</p>}

        <div className="flex justify-end">
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit report'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
