import { useEffect, useState } from 'react'
import { Heart, ChevronDown, ChevronRight, Loader } from 'lucide-react'

interface HubParticipant {
  id: string
  name: string
  status: string
  goals?: string[]
  support_schedule?: any[]
  wellbeing_checkins?: any[]
}

function WellbeingBadge({ score }: { score: number }) {
  const color = score >= 7 ? '#4ade80' : score >= 4 ? '#fbbf24' : '#f87171'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      <span style={{ fontSize: 13, color }}>{score}/10</span>
    </div>
  )
}

export default function ParticipantHub() {
  const [participants, setParticipants] = useState<HubParticipant[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      // First try KindCare-specific endpoint, fall back to KiNDIS participants
      const data = await fetch('http://localhost:7865/api/participants').then(r => r.ok ? r.json() : null).catch(() => null)
        ?? await fetch('http://localhost:7864/api/participants').then(r => r.ok ? r.json() : []).catch(() => [])
      setParticipants(data)
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div>
      <div style={{ marginBottom: 20, padding: '14px 18px', borderRadius: 12, background: 'rgba(244,114,182,.07)', border: '1px solid rgba(244,114,182,.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Heart size={14} color="#f472b6" />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#f472b6' }}>Participant Hub</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          Wellbeing check-ins, support schedules, and participant goals. Accessibility-first.
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--color-text-muted)' }}><Loader size={20} className="spin" style={{ display: 'inline', marginRight: 8 }} /> Loading…</div>
      ) : participants.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center' }}>
          <Heart size={28} color="var(--color-text-dim)" style={{ marginBottom: 12 }} />
          <div style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 4 }}>No participants registered</div>
          <div style={{ color: 'var(--color-text-dim)', fontSize: 12 }}>Register participants in the Participants panel first</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {participants.map(p => (
            <div key={p.id} className="card">
              <button
                onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                style={{ width: '100%', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(244,114,182,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#f472b6' }}>{p.name.charAt(0)}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', marginBottom: 2 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    <span className={`badge ${p.status === 'active' ? 'badge-green' : 'badge-muted'}`} style={{ fontSize: 10 }}>{p.status || 'Active'}</span>
                  </div>
                </div>
                {expanded === p.id ? <ChevronDown size={16} color="var(--color-text-muted)" /> : <ChevronRight size={16} color="var(--color-text-muted)" />}
              </button>

              {expanded === p.id && (
                <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--color-border)' }}>
                  <div style={{ paddingTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>Wellbeing Check-ins</div>
                      {(p.wellbeing_checkins || []).length === 0 ? (
                        <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No check-ins recorded</div>
                      ) : (p.wellbeing_checkins || []).slice(0, 5).map((c: any, i: number) => (
                        <div key={i} style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 2 }}>{c.date || '—'}</div>
                          <WellbeingBadge score={c.score || 5} />
                          {c.notes && <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2, fontStyle: 'italic' }}>"{c.notes}"</div>}
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>Support Schedule</div>
                      {(p.support_schedule || []).length === 0 ? (
                        <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No schedule set</div>
                      ) : (p.support_schedule || []).map((s: any, i: number) => (
                        <div key={i} style={{ marginBottom: 8, fontSize: 13 }}>
                          <div style={{ fontWeight: 500 }}>{s.day || s.date}</div>
                          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{s.time} · {s.support_type}</div>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>Goals</div>
                      {(p.goals || []).length === 0 ? (
                        <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No goals recorded</div>
                      ) : (p.goals || []).map((g: any, i: number) => (
                        <div key={i} style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f472b6', marginTop: 5, flexShrink: 0 }} />
                          <div style={{ fontSize: 13, lineHeight: 1.5 }}>{typeof g === 'string' ? g : g.description || g.goal}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
