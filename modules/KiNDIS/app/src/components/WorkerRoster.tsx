import { useEffect, useState } from 'react'
import { Plus, Loader, X, UserCheck } from 'lucide-react'

interface Worker {
  id: string
  name: string
  role: string
  email?: string
  phone?: string
  screening_clearance?: string
  assigned_participants?: string[]
  status: string
}

function AddWorkerForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', role: '', email: '', phone: '', screening_clearance: '' })
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const r = await fetch('http://localhost:7864/api/workers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      if (r.ok) { onSaved(); onClose() }
    } finally { setSaving(false) }
  }

  const roles = ['Support Worker', 'Senior Support Worker', 'Team Leader', 'Coordinator', 'OT', 'Behaviour Support Practitioner', 'Admin']

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div className="card" style={{ width: 460, padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontWeight: 600 }}>Add Worker</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={14} /></button>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input required placeholder="Full name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ width: '100%' }} />
          <select required value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={{ width: '100%' }}>
            <option value="">Select role…</option>
            {roles.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input type="email" placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            <input placeholder="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
          <input placeholder="NDIS Worker Screening clearance number" value={form.screening_clearance} onChange={e => setForm(f => ({ ...f, screening_clearance: e.target.value }))} style={{ width: '100%' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Add Worker'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function WorkerRoster() {
  const [workers, setWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  async function load() {
    setLoading(true)
    const data = await fetch('http://localhost:7864/api/workers').then(r => r.ok ? r.json() : []).catch(() => [])
    setWorkers(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function statusColor(s: string) {
    if (s === 'active') return 'badge-green'
    if (s === 'inactive') return 'badge-muted'
    return 'badge-amber'
  }

  function clearanceColor(c?: string) {
    if (!c) return 'badge-red'
    return 'badge-green'
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={14} /> Add Worker</button>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}><Loader size={18} className="spin" style={{ display: 'inline', marginRight: 8 }} /> Loading…</div>
        ) : workers.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <UserCheck size={28} color="var(--color-text-dim)" style={{ marginBottom: 12 }} />
            <div style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 4 }}>No workers on roster yet</div>
            <div style={{ color: 'var(--color-text-dim)', fontSize: 12 }}>Add workers to track their roster and screening status</div>
          </div>
        ) : (
          <table>
            <thead><tr>
              <th>Name</th><th>Role</th><th>Assigned Participants</th><th>Screening</th><th>Status</th>
            </tr></thead>
            <tbody>
              {workers.map(w => (
                <tr key={w.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{w.name}</div>
                    {w.email && <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 1 }}>{w.email}</div>}
                  </td>
                  <td style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{w.role}</td>
                  <td>
                    {(w.assigned_participants || []).length > 0 ? (
                      <span style={{ fontSize: 12 }}>{w.assigned_participants!.length} participant(s)</span>
                    ) : <span style={{ color: 'var(--color-text-dim)', fontSize: 12 }}>None assigned</span>}
                  </td>
                  <td>
                    <span className={`badge ${clearanceColor(w.screening_clearance)}`}>
                      {w.screening_clearance ? 'Cleared' : 'No clearance'}
                    </span>
                  </td>
                  <td><span className={`badge ${statusColor(w.status)}`}>{w.status || 'Active'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && <AddWorkerForm onClose={() => setShowForm(false)} onSaved={load} />}
    </div>
  )
}
