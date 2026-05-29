import { useEffect, useState } from 'react'
import { Plus, Download, Loader, X } from 'lucide-react'

interface Note {
  id: string
  participant_id: string
  participant_name?: string
  support_item_code: string
  note: string
  support_minutes: number
  date: string
  created_at: string
  compliance_status: string
  billed?: boolean
}

function NewNoteForm({ participants, onClose, onSaved }: { participants: any[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ participant_id: '', support_item_code: '', note: '', support_minutes: '', date: new Date().toISOString().slice(0, 10) })
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const r = await fetch('http://localhost:7864/api/case-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, support_minutes: Number(form.support_minutes) }),
      })
      if (r.ok) { onSaved(); onClose() }
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div className="card" style={{ width: 540, padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontWeight: 600 }}>New Case Note</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={14} /></button>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <select required value={form.participant_id} onChange={e => setForm(f => ({ ...f, participant_id: e.target.value }))} style={{ width: '100%' }}>
            <option value="">Select participant…</option>
            {participants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <input required placeholder="Support item code" value={form.support_item_code} onChange={e => setForm(f => ({ ...f, support_item_code: e.target.value }))} />
            <input type="number" required min={1} placeholder="Minutes" value={form.support_minutes} onChange={e => setForm(f => ({ ...f, support_minutes: e.target.value }))} />
            <input type="date" required value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <textarea required placeholder="Case note…" rows={5} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} style={{ width: '100%', resize: 'vertical' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Note'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function CaseNotes() {
  const [notes, setNotes] = useState<Note[]>([])
  const [participants, setParticipants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterParticipant, setFilterParticipant] = useState('')
  const [showForm, setShowForm] = useState(false)

  async function load() {
    setLoading(true)
    const [n, p] = await Promise.all([
      fetch('http://localhost:7864/api/case-notes').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('http://localhost:7864/api/participants').then(r => r.ok ? r.json() : []).catch(() => []),
    ])
    setNotes(n)
    setParticipants(p)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function exportNote(id: string) {
    window.open(`http://localhost:7864/api/case-notes/${id}/export`, '_blank')
  }

  const filtered = filterParticipant ? notes.filter(n => n.participant_id === filterParticipant) : notes

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <select value={filterParticipant} onChange={e => setFilterParticipant(e.target.value)} style={{ minWidth: 220 }}>
          <option value="">All participants</option>
          {participants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={14} /> New Case Note</button>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}><Loader size={18} className="spin" style={{ display: 'inline', marginRight: 8 }} /> Loading…</div>
        ) : (
          <table>
            <thead><tr>
              <th>Participant</th><th>Support Code</th><th>Date</th><th>Minutes</th><th>Compliance</th><th>Billed</th><th style={{ width: 50 }}></th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>No case notes found</td></tr>
              ) : filtered.map(note => (
                <tr key={note.id}>
                  <td style={{ fontWeight: 500 }}>{note.participant_name || note.participant_id}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{note.support_item_code}</td>
                  <td>{note.date || note.created_at?.slice(0, 10)}</td>
                  <td>{note.support_minutes}</td>
                  <td><span className={`badge ${note.compliance_status === 'non_compliant' ? 'badge-amber' : 'badge-green'}`}>{note.compliance_status === 'non_compliant' ? 'Review' : 'Compliant'}</span></td>
                  <td><span className={`badge ${note.billed ? 'badge-green' : 'badge-muted'}`}>{note.billed ? 'Yes' : 'No'}</span></td>
                  <td>
                    <button className="btn btn-ghost btn-sm" title="Export" onClick={() => exportNote(note.id)}><Download size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && <NewNoteForm participants={participants} onClose={() => setShowForm(false)} onSaved={load} />}
    </div>
  )
}
