import { useEffect, useState } from 'react'
import { ShieldCheck, Play, Loader } from 'lucide-react'

interface Audit {
  id: string
  audit_type: string
  date: string
  created_at: string
  status: string
  findings?: string
  recommendations?: string
}

const COMPLIANCE_DOMAINS = [
  { id: 'service_delivery', label: 'Service Delivery', description: 'Support plans current, reviewed within 12 months' },
  { id: 'incident_reporting', label: 'Incident Reporting', description: 'Incidents reported within required timeframes' },
  { id: 'worker_screening', label: 'Worker Screening', description: 'All workers hold valid NDIS Worker Screening clearance' },
  { id: 'documentation', label: 'Documentation', description: 'Case notes compliant with NDIS Practice Standards' },
]

function DomainCard({ domain, status }: { domain: typeof COMPLIANCE_DOMAINS[0]; status: 'GREEN' | 'AMBER' | 'RED' | 'UNKNOWN' }) {
  const color = status === 'GREEN' ? '#4ade80' : status === 'RED' ? '#f87171' : status === 'AMBER' ? '#fbbf24' : 'var(--color-text-muted)'
  const bg = status === 'GREEN' ? 'rgba(74,222,128,.08)' : status === 'RED' ? 'rgba(248,113,113,.08)' : status === 'AMBER' ? 'rgba(251,191,36,.08)' : 'var(--color-surface-2)'
  return (
    <div className="card" style={{ padding: 18, background: bg, borderColor: `${color}30` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{domain.label}</span>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 2 }} />
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{domain.description}</div>
      <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '.06em' }}>{status}</div>
    </div>
  )
}

export default function Compliance() {
  const [audits, setAudits] = useState<Audit[]>([])
  const [domainStatus] = useState<Record<string, 'GREEN' | 'AMBER' | 'RED' | 'UNKNOWN'>>({
    service_delivery: 'GREEN',
    incident_reporting: 'AMBER',
    worker_screening: 'GREEN',
    documentation: 'AMBER',
  })
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)

  async function load() {
    setLoading(true)
    const data = await fetch('http://localhost:7864/api/audits').then(r => r.ok ? r.json() : []).catch(() => [])
    setAudits(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function runAudit() {
    setRunning(true)
    try {
      await fetch('http://localhost:7864/api/audits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audit_type: 'Manual Audit' }) })
      load()
    } finally { setRunning(false) }
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {COMPLIANCE_DOMAINS.map(d => <DomainCard key={d.id} domain={d} status={domainStatus[d.id] || 'UNKNOWN'} />)}
      </div>

      <div className="card">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={14} color="var(--color-text-muted)" />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Audit History</span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={runAudit} disabled={running}>
            {running ? <><Loader size={12} className="spin" /> Running…</> : <><Play size={12} /> Run Audit</>}
          </button>
        </div>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}><Loader size={18} className="spin" style={{ display: 'inline', marginRight: 8 }} /> Loading…</div>
        ) : (
          <table>
            <thead><tr>
              <th>Audit Type</th><th>Date</th><th>Status</th><th>Findings</th>
            </tr></thead>
            <tbody>
              {audits.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>No audits yet</td></tr>
              ) : audits.map(a => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 500 }}>{a.audit_type || 'Compliance Audit'}</td>
                  <td>{(a.date || a.created_at || '—').slice(0, 10)}</td>
                  <td><span className={`badge ${a.status === 'passed' ? 'badge-green' : a.status === 'failed' ? 'badge-red' : 'badge-amber'}`}>{a.status || 'Pending'}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--color-text-muted)', maxWidth: 300 }}>{a.findings || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
