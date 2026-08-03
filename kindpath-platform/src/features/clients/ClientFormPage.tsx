import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { createClient, getClient, updateClient, type NewClient } from '@/features/clients/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

const emptyForm: NewClient = {
  name: '',
  dob: '',
  ndis_number: '',
  plan_end_date: '',
  support_coordinator: '',
  phone: '',
  address: '',
  emergency_contact: '',
  care_plan: '',
  routines: '',
  communication_preferences: '',
  goals: '',
  status: 'active',
};

export function ClientFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState<NewClient>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(!isEdit);

  useAsync(async () => {
    if (!id) return null;
    const client = await getClient(id);
    setForm({ ...client, dob: client.dob ?? '', plan_end_date: client.plan_end_date ?? '' });
    setHydrated(true);
    return client;
  }, [id]);

  function set<K extends keyof NewClient>(key: K, value: NewClient[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const cleaned = {
        ...form,
        dob: form.dob || null,
        plan_end_date: form.plan_end_date || null,
      };
      const client = isEdit && id ? await updateClient(id, cleaned) : await createClient(cleaned);
      navigate(`/clients/${client.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!hydrated) return <p className="text-sm text-slate">Loading…</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold text-forest-700">
        {isEdit ? 'Edit client' : 'New client'}
      </h1>

      <form onSubmit={handleSubmit}>
        <Card className="space-y-4">
          <Field label="Name" required>
            <input
              required
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Date of birth">
              <input
                type="date"
                value={form.dob ?? ''}
                onChange={(e) => set('dob', e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="NDIS number">
              <input
                value={form.ndis_number ?? ''}
                onChange={(e) => set('ndis_number', e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Plan end date">
              <input
                type="date"
                value={form.plan_end_date ?? ''}
                onChange={(e) => set('plan_end_date', e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Support coordinator">
              <input
                value={form.support_coordinator ?? ''}
                onChange={(e) => set('support_coordinator', e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Phone">
              <input
                value={form.phone ?? ''}
                onChange={(e) => set('phone', e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Emergency contact">
              <input
                value={form.emergency_contact ?? ''}
                onChange={(e) => set('emergency_contact', e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Address">
            <input
              value={form.address ?? ''}
              onChange={(e) => set('address', e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Care plan">
            <textarea
              value={form.care_plan ?? ''}
              onChange={(e) => set('care_plan', e.target.value)}
              rows={3}
              className={inputClass}
            />
          </Field>

          <Field label="Routines">
            <textarea
              value={form.routines ?? ''}
              onChange={(e) => set('routines', e.target.value)}
              rows={3}
              className={inputClass}
            />
          </Field>

          <Field label="Communication preferences">
            <textarea
              value={form.communication_preferences ?? ''}
              onChange={(e) => set('communication_preferences', e.target.value)}
              rows={2}
              className={inputClass}
            />
          </Field>

          <Field label="Goals">
            <textarea
              value={form.goals ?? ''}
              onChange={(e) => set('goals', e.target.value)}
              rows={3}
              className={inputClass}
            />
          </Field>

          <Field label="Status">
            <select
              value={form.status}
              onChange={(e) => set('status', e.target.value as NewClient['status'])}
              className={inputClass}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>

          {error && <p className="text-sm text-terracotta">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create client'}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}

const inputClass =
  'mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm focus:border-forest focus:outline-none';

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm font-medium text-forest-700">
      {label}
      {required && <span className="text-terracotta"> *</span>}
      {children}
    </label>
  );
}
