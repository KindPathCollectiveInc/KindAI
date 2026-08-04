import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { createShift, listShifts, SHIFT_STATUS_LABELS, updateShift } from '@/features/roster/api';
import { listClients } from '@/features/clients/api';
import { listPeople } from '@/features/people/api';
import type { ShiftStatus } from '@/types/database';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthContext';

const statusTone: Record<ShiftStatus, 'terracotta' | 'sage' | 'slate' | 'forest'> = {
  scheduled: 'forest',
  completed: 'sage',
  cancelled: 'slate',
};

export function RosterPage() {
  const { profile } = useAuth();
  const { data: shifts, loading, reload } = useAsync(listShifts, []);
  const { data: clients } = useAsync(listClients, []);
  const { data: people } = useAsync(listPeople, []);
  const [showForm, setShowForm] = useState(false);

  const canManage = profile && ['admin', 'care_advocacy', 'committee'].includes(profile.role);
  const isContractor = profile?.role === 'contractor';

  const clientName = (id: string) => clients?.find((c) => c.id === id)?.name ?? 'Client';
  const staffName = (id: string) => people?.find((p) => p.id === id)?.full_name ?? 'Staff';

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (shifts ?? []).filter((s) => s.date >= today);
  const past = (shifts ?? []).filter((s) => s.date < today);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-forest-700">Roster</h1>
          <p className="text-sm text-slate">
            {isContractor ? 'Your rostered shifts.' : 'Shift scheduling across the caseload.'}
          </p>
        </div>
        {canManage && <Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Close' : 'Schedule shift'}</Button>}
      </div>

      {showForm && (
        <ShiftForm
          clientOptions={(clients ?? []).map((c) => ({ id: c.id, name: c.name }))}
          staffOptions={(people ?? []).map((p) => ({ id: p.id, name: p.full_name }))}
          onCreated={() => {
            setShowForm(false);
            reload();
          }}
        />
      )}

      {loading && <p className="text-sm text-slate">Loading…</p>}

      <h2 className="mb-2 text-sm font-semibold text-forest-700">Upcoming</h2>
      <div className="mb-6 space-y-2">
        {upcoming.length === 0 && <p className="text-sm text-slate">Nothing scheduled.</p>}
        {upcoming.map((s) => (
          <Card key={s.id} className="flex items-center justify-between">
            <div>
              <Link to={`/clients/${s.client_id}`} className="text-sm font-medium text-forest-700 hover:underline">
                {clientName(s.client_id)}
              </Link>
              <p className="text-xs text-slate">
                {new Date(s.date).toLocaleDateString('en-AU')}
                {s.start_time && ` · ${s.start_time.slice(0, 5)}`}
                {s.end_time && `–${s.end_time.slice(0, 5)}`}
                {' · '}
                {staffName(s.staff_id)}
              </p>
              {s.notes && <p className="mt-1 text-xs text-slate">{s.notes}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={statusTone[s.status]}>{SHIFT_STATUS_LABELS[s.status]}</Badge>
              {s.staff_id === profile?.id && s.status === 'scheduled' && (
                <Button variant="ghost" onClick={() => updateShift(s.id, { status: 'completed' }).then(reload)}>
                  Mark complete
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {past.length > 0 && (
        <>
          <h2 className="mb-2 text-sm font-semibold text-forest-700">Past</h2>
          <div className="space-y-2">
            {past.slice(0, 20).map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-sand-100 px-3 py-2">
                <p className="text-sm text-forest-700">
                  {clientName(s.client_id)} · {new Date(s.date).toLocaleDateString('en-AU')} · {staffName(s.staff_id)}
                </p>
                <Badge tone={statusTone[s.status]}>{SHIFT_STATUS_LABELS[s.status]}</Badge>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ShiftForm({
  clientOptions,
  staffOptions,
  onCreated,
}: {
  clientOptions: { id: string; name: string }[];
  staffOptions: { id: string; name: string }[];
  onCreated: () => void;
}) {
  const [clientId, setClientId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createShift({
        client_id: clientId,
        staff_id: staffId,
        date,
        start_time: startTime || null,
        end_time: endTime || null,
        notes: notes || null,
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
            Client
            <select
              required
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
            >
              <option value="">Select…</option>
              {clientOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-forest-700">
            Support worker
            <select
              required
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
            >
              <option value="">Select…</option>
              {staffOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-3 gap-3">
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
            Start
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium text-forest-700">
            End
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <label className="block text-sm font-medium text-forest-700">
          Notes
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
          />
        </label>

        {error && <p className="text-sm text-terracotta">{error}</p>}

        <div className="flex justify-end">
          <Button type="submit" disabled={submitting || !clientId || !staffId || !date}>
            {submitting ? 'Scheduling…' : 'Schedule shift'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
