import { useEffect, useState } from 'react'
import { Users, FileText, DollarSign, ShieldCheck, Loader } from 'lucide-react'

interface Stats {
  participants: number
  caseNotesWeek: number
  unbilledItems: number
  complianceStatus: 'GREEN' | 'AMBER' | 'RED'
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [recentNotes, setRecentNotes] = useState<any[]>([])
  const [audits, setAudits] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [participants, notes, auditList] = await Promise.all([
        fetch('http://localhost:7864/api/participants').then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('http://localhost:7864/api/case-notes').then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('http://localhost:7864/api/audits').then(r => r.ok ? r.json() : []).catch(() => []),
      ])
      const now = new Date()
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const notesThisWeek = notes.filter((n: any) => new Date(n.created_at || n.date) >= weekAgo)
      const unbilled = notes.filter((n: any) => !n.billed)
      const hasNonCompliant = notes.some((n: any) => n.compliance_status === 'non_compliant')
      setStats({
        participants: Array.isArray(participants) ? participants.length : 0,
        caseNotesWeek: notesThisWeek.length,
        unbilledItems: unbilled.length,
        complianceStatus: hasNonCompliant ? 'AMBER' : 'GREEN',
      })
      setRecentNotes(notes.slice(0, 6))
      setAudits(Array.isArray(auditList) ? auditList.slice(0, 5) : [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--color-text-muted)' }}>
      <Loader size={20} className="spin" style={{ marginRight: 8 }} /> Loading…
    </div>
  )

  const statCards = [
    { icon: Users, label: 'Participants', value: stats?.participants ?? 0, color: '#60a5fa' },
    { icon: FileText, label: 'Case Notes (7d)', value: stats?.caseNotesWeek ?? 0, color: '#a78bfa' },
    { icon: DollarSign, label: 'Unbilled Items', value: stats?.unbilledItems ?? 0, color: '#34d399' },
    { icon: ShieldCheck, label: 'Compliance', value: stats?.complianceStatus ?? '—', color: stats?.complianceStatus === 'GREEN' ? '#4ade80' : stats?.complianceStatus === 'RED' ? '#f87171' : '#fbbf24' },
  ]

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        {statCards.map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={16} color={color} />
              </div>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 500 }}>{label}</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={14} color="var(--color-text-muted)" />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Recent Case Notes</span>
          </div>
          <div>
            {recentNotes.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>No case notes yet</div>
            ) : recentNotes.map((note, i) => (
              <div key={i} style={{ padding: '12px 20px', borderBottom: i < recentNotes.length - 1 ? '1px solid var(--color-border)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{note.participant_name || note.participant_id || '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{note.support_item_code || '—'} · {note.support_minutes || 0}min</div>
                </div>
                <span className={`badge ${note.compliance_status === 'non_compliant' ? 'badge-amber' : 'badge-green'}`}>
                  {note.compliance_status === 'non_compliant' ? 'Review' : 'OK'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={14} color="var(--color-text-muted)" />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Upcoming Audits</span>
          </div>
          <div>
            {audits.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>No audits scheduled</div>
            ) : audits.map((audit, i) => (
              <div key={i} style={{ padding: '12px 20px', borderBottom: i < audits.length - 1 ? '1px solid var(--color-border)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{audit.audit_type || 'Compliance Audit'}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{audit.date || audit.created_at || '—'}</div>
                </div>
                <span className={`badge ${audit.status === 'passed' ? 'badge-green' : audit.status === 'failed' ? 'badge-red' : 'badge-amber'}`}>
                  {audit.status || 'Pending'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
