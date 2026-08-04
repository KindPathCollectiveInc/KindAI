import { useState, type FormEvent } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { createEvent, deleteEvent, listEvents, VISIBILITY_LABELS } from '@/features/calendar/api';
import type { EventVisibility } from '@/types/database';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthContext';

export function CalendarPage() {
  const { profile } = useAuth();
  const { data: events, loading, reload } = useAsync(listEvents, []);
  const [showForm, setShowForm] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (events ?? []).filter((e) => e.date >= today);
  const past = (events ?? []).filter((e) => e.date < today);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-forest-700">Calendar</h1>
          <p className="text-sm text-slate">Shared team events, plus your own solo entries.</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Close' : 'Add event'}</Button>
      </div>

      {showForm && (
        <EventForm
          onCreated={() => {
            setShowForm(false);
            reload();
          }}
        />
      )}

      {loading && <p className="text-sm text-slate">Loading…</p>}

      <div className="space-y-2">
        {upcoming.map((e) => (
          <Card key={e.id}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-forest-700">{e.title}</p>
                <p className="text-xs text-slate">
                  {new Date(e.date).toLocaleDateString('en-AU')}
                  {e.start_time && ` · ${e.start_time.slice(0, 5)}`}
                </p>
                {e.description && <p className="mt-1 text-sm text-slate">{e.description}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={e.visibility === 'shared' ? 'forest' : 'slate'}>{e.visibility}</Badge>
                {e.owner_id === profile?.id && (
                  <Button variant="ghost" onClick={() => deleteEvent(e.id).then(reload)}>
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
        {upcoming.length === 0 && !loading && <p className="text-sm text-slate">Nothing upcoming.</p>}
      </div>

      {past.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-slate">Past events</summary>
          <div className="mt-2 space-y-1">
            {past.slice(0, 20).map((e) => (
              <p key={e.id} className="text-xs text-slate">
                {new Date(e.date).toLocaleDateString('en-AU')} — {e.title}
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function EventForm({ onCreated }: { onCreated: () => void }) {
  const { profile } = useAuth();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [visibility, setVisibility] = useState<EventVisibility>('shared');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSubmitting(true);
    try {
      await createEvent({
        title,
        date,
        start_time: startTime || null,
        visibility,
        owner_id: profile.id,
      });
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mb-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block text-sm font-medium text-forest-700">
          Title
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-forest-700">
            Date
            <input
              required
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium text-forest-700">
            Time
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <label className="block text-sm font-medium text-forest-700">
          Visibility
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as EventVisibility)}
            className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
          >
            {Object.entries(VISIBILITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex justify-end">
          <Button type="submit" disabled={submitting || !title.trim() || !date}>
            {submitting ? 'Saving…' : 'Add event'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
