import { useEffect, useState } from 'react'
import { DollarSign, Clock, AlertCircle, CheckSquare, Loader } from 'lucide-react'

interface BillingItem {
  id: string
  participant_name?: string
  support_item_code: string
  support_minutes: number
  date: string
  claim_amount?: number
  status: string
}

export default function Billing() {
  const [items, setItems] = useState<BillingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)

  async function load() {
    setLoading(true)
    const data = await fetch('http://localhost:7864/api/billing').then(r => r.ok ? r.json() : []).catch(() => [])
    setItems(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const totalMinutes = items.reduce((s, i) => s + (i.support_minutes || 0), 0)
  const estimatedAmount = items.reduce((s, i) => s + (i.claim_amount || (i.support_minutes / 60) * 85), 0)
  const pendingClaim = items.filter(i => i.status === 'unbilled' || i.status === 'pending')

  async function submitClaims() {
    if (selected.size === 0) return
    setSubmitting(true)
    try {
      await fetch('http://localhost:7864/api/billing/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_ids: [...selected] }),
      })
      setSelected(new Set())
      load()
    } finally { setSubmitting(false) }
  }

  function toggleAll() {
    if (selected.size === pendingClaim.length) { setSelected(new Set()) }
    else { setSelected(new Set(pendingClaim.map(i => i.id))) }
  }

  function toggle(id: string) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const summaryCards = [
    { icon: Clock, label: 'Total Hours', value: `${(totalMinutes / 60).toFixed(1)}h`, color: '#60a5fa' },
    { icon: DollarSign, label: 'Est. Amount', value: `$${estimatedAmount.toFixed(2)}`, color: '#34d399' },
    { icon: AlertCircle, label: 'Pending Claim', value: pendingClaim.length, color: '#fbbf24' },
  ]

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {summaryCards.map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={18} color={color} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
            </div>
          </div>
        ))}
      </div>

      {selected.size > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button className="btn btn-primary" onClick={submitClaims} disabled={submitting}>
            <CheckSquare size={14} /> {submitting ? 'Submitting…' : `Submit ${selected.size} Claim${selected.size > 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      <div className="card">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}><Loader size={18} className="spin" style={{ display: 'inline', marginRight: 8 }} /> Loading…</div>
        ) : (
          <table>
            <thead><tr>
              <th style={{ width: 40 }}>
                <input type="checkbox" checked={selected.size === pendingClaim.length && pendingClaim.length > 0} onChange={toggleAll} />
              </th>
              <th>Participant</th><th>Support Code</th><th>Date</th><th>Minutes</th><th>Est. Amount</th><th>Status</th>
            </tr></thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>No billing items</td></tr>
              ) : items.map(item => (
                <tr key={item.id}>
                  <td>
                    {(item.status === 'unbilled' || item.status === 'pending') && (
                      <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
                    )}
                  </td>
                  <td style={{ fontWeight: 500 }}>{item.participant_name || '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.support_item_code}</td>
                  <td>{item.date?.slice(0, 10)}</td>
                  <td>{item.support_minutes}</td>
                  <td>${(item.claim_amount || (item.support_minutes / 60) * 85).toFixed(2)}</td>
                  <td><span className={`badge ${item.status === 'claimed' ? 'badge-green' : item.status === 'rejected' ? 'badge-red' : 'badge-amber'}`}>{item.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
