import { useEffect, useState } from 'react'
import { Search, ChevronDown, ChevronRight, Plus, Loader, X } from 'lucide-react'

interface Participant {
  id: string
  name: string
  ndis_ref: string
  dob: string
  plan_start: string
  plan_end: string
  status: string
  funding_categories?: string
  consent_records?: any[]
  case_note_count?: number
}

function RegisterForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', ndis_ref: '', dob: '', plan_start: '', plan_end: '', funding_categories: '' })
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const r = await fetch('http://localhost:7864/api/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (r.ok) { onSaved(); onClose() }
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div className="card" style={{ width: 480, padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontWeight: 600 }}>Register Participant</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={14} /></button>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input required placeholder="Full name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ width: '100%' }} />
          <input required placeholder="NDIS Reference" value={form.ndis_ref} onChange={e => setForm(f => ({ ...f, ndis_ref: e.target.value }))} style={{ width: '100%' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div><label style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>Date of Birth</label><input type="date" required value={form.dob} onChange={e => setForm(f => ({ ...f, dob: e.target.value }))} style={{ width: '100%' }} /></div>
            <div><label style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>Plan Start</label><input type="date" value={form.plan_start} onChange={e => setForm(f => ({ ...f, plan_start: e.target.value }))} style={{ width: '100%' }} /></div>
            <div><label style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>Plan End</label><input type="date" value={form.plan_end} onChange={e => setForm(f => ({ ...f, plan_end: e.target.value }))} style={{ width: '100%' }} /></div>
          </div>
          <textarea placeholder="Funding categories (one per line)" rows={3} value={form.funding_categories} onChange={e => setForm(f => ({ ...f, funding_categories: e.target.value }))} style={{ width: '100%', resize: 'vertical' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Register'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Participants() {
  const [list, setList] = useState<Participant[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  async function load() {
    setLoading(true)
    const data = await fetch('http://localhost:7864/api/participants').then(r => r.ok ? r.json() : []).catch(() => [])
    setList(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = list.filter(p =>
    p.name?.toLowerCase().includes(query.toLowerCase()) ||
    p.ndis_ref?.toLowerCase().includes(query.toLowerCase())
  )

  function statusColor(s: string) {
    if (s === 'active') return 'badge-green'
    if (s === 'inactive') return 'badge-muted'
    return 'badge-amber'
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input placeholder="Search name or NDIS ref…" value={query} onChange={e => setQuery(e.target.value)} style={{ paddingLeft: 36, width: '100%' }} />
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={14} /> Register Participant</button>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}><Loader size={18} className="spin" style={{ display: 'inline', marginRight: 8 }} /> Loading…</div>
        ) : (
          <table>
            <thead><tr>
              <th style={{ width: 28 }}></th>
              <th>Name</th><th>NDIS Ref</th><th>DOB</th><th>Plan Expiry</th><th>Status</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>No participants found</td></tr>
              ) : filtered.map(p => (
                <>
                  <tr key={p.id} onClick={() => setExpanded(expanded === p.id ? null : p.id)} style={{ cursor: 'pointer' }}>
                    <td>{expanded === p.id ? <ChevronDown size={13} color="var(--color-text-muted)" /> : <ChevronRight size={13} color="var(--color-text-muted)" />}</td>
                    <td style={{ fontWeight: 500 }}>{p.name}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{p.ndis_ref}</td>
                    <td>{p.dob}</td>
                    <td>{p.plan_end}</td>
                    <td><span className={`badge ${statusColor(p.status)}`}>{p.status || 'Active'}</span></td>
                  </tr>
                  {expanded === p.id && (
                    <tr key={`${p.id}-exp`}>
                      <td colSpan={6} style={{ background: 'var(--color-surface-2)', padding: '16px 20px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, fontSize: 13 }}>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Funding Categories</div>
                            <div style={{ color: 'var(--color-text)', lineHeight: 1.6 }}>
                              {p.funding_categories ? p.funding_categories.split('\n').map((c, i) => <div key={i}>· {c}</div>) : <span style={{ color: 'var(--color-text-muted)' }}>None recorded</span>}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Consent</div>
                            <div style={{ color: 'var(--color-text)' }}>
                              {(p.consent_records || []).length} consent record(s)
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Case Notes</div>
                            <div style={{ color: 'var(--color-text)' }}>{p.case_note_count ?? '—'} note(s)</div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && <RegisterForm onClose={() => setShowForm(false)} onSaved={load} />}
    </div>
  )
}
