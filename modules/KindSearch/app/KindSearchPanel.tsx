/**
 * KindSearch — field research & knowledge discovery.
 * Search interface, recent searches, saved resources, active research projects.
 */
import { useState, useEffect } from 'react'
import { Search, Plus, BookMarked, Folder, Tag, ExternalLink, Clock, ArrowRight } from 'lucide-react'

const PORT = 7872
const COLOR = '#38bdf8'

async function api(ep: string) {
  try {
    const r = await fetch(`http://localhost:${PORT}${ep}`, { signal: AbortSignal.timeout(3000) })
    return r.ok ? r.json() : null
  } catch { return null }
}

const RECENT_SEARCHES = [
  'NDIS behaviour support practice standards 2024',
  'psychoacoustic frequency field research',
  'regenerative economics doughnut model',
  'community land trusts australia',
  'KindPath LSII late song inversion',
]

const SAVED_RESOURCES = [
  { id: '1', title: 'NDIS Quality & Safeguards Commission Guidelines', url: '', type: 'Document', tags: ['ndis', 'compliance'], date: '12 Mar' },
  { id: '2', title: 'Towards a Psychosomatic Theory of Sound — Collins, 2021', url: '', type: 'Paper', tags: ['audio', 'research'], date: '10 Mar' },
  { id: '3', title: 'Doughnut Economics: Seven Ways to Think Like a 21st-Century Economist', url: '', type: 'Book', tags: ['economics', 'regenerative'], date: '5 Mar' },
  { id: '4', title: 'Aboriginal and Torres Strait Islander data sovereignty principles', url: '', type: 'Report', tags: ['data', 'sovereignty'], date: '2 Mar' },
]

const PROJECTS = [
  { id: '1', name: 'KiNDIS Evidence Base', desc: 'Assembling research to support disability support methodology', tags: ['ndis', 'health'], count: 14, color: '#a78bfa' },
  { id: '2', name: 'Audio Signal Research', desc: 'Psychoacoustic and psychosomatic mapping literature', tags: ['audio', 'research'], count: 22, color: COLOR },
  { id: '3', name: 'Regenerative Finance Models', desc: 'Alternatives to extractive economic structures', tags: ['economics'], count: 9, color: '#22c55e' },
]

export default function KindSearchPanel() {
  const [online, setOnline] = useState<boolean | null>(null)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<string[] | null>(null)

  useEffect(() => {
    api('/api/health').then(r => setOnline(r !== null))
  }, [])

  async function doSearch(q: string) {
    if (!q.trim()) return
    setSearching(true)
    const r = await api(`/api/search?q=${encodeURIComponent(q)}`)
    setResults(r?.results ?? [])
    setSearching(false)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') doSearch(query)
  }

  const typeColor = (t: string) => ({ Document: COLOR, Paper: '#e879f9', Book: '#f59e0b', Report: '#22c55e' } as Record<string, string>)[t] ?? '#6b7280'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--color-bg)' }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: `${COLOR}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Search style={{ width: 18, height: 18, color: COLOR }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>KindSearch</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Field research & knowledge discovery</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: online === true ? '#22c55e' : online === false ? '#ef4444' : '#6b7280' }} />
          <span style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{online === null ? '···' : online ? ':7872' : 'offline'}</span>
        </div>
        <button style={{ display: 'flex', alignItems: 'center', gap: 5, background: COLOR, border: 'none', borderRadius: 7, padding: '6px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#000', flexShrink: 0 }}>
          <Plus style={{ width: 12, height: 12 }} />New Project
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
        {/* Search bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--color-surface)', border: `1px solid ${query ? COLOR : 'var(--color-border)'}`, borderRadius: 10, padding: '10px 14px', transition: 'border-color 0.15s' }}>
            <Search style={{ width: 15, height: 15, color: query ? COLOR : 'var(--color-text-muted)', flexShrink: 0 }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Search your knowledge field…"
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 13, color: 'var(--color-text)' }}
            />
          </div>
          <button onClick={() => doSearch(query)} style={{ background: COLOR, border: 'none', borderRadius: 9, padding: '0 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: '#000', fontSize: 12, fontWeight: 600 }}>
            {searching ? '···' : <><ArrowRight style={{ width: 14, height: 14 }} />Search</>}
          </button>
        </div>

        {results !== null ? (
          results.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-text-muted)', fontSize: 13 }}>No results found. Try different keywords or browse your saved resources below.</div>
          ) : (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Results</div>
              {results.map((r, i) => (
                <div key={i} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '10px 14px', marginBottom: 8, fontSize: 12 }}>{r}</div>
              ))}
            </div>
          )
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 14 }}>
          {/* Saved resources */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--color-border)', fontSize: 12, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><BookMarked style={{ width: 13, height: 13, color: COLOR }} />Saved Resources</div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLOR, fontSize: 11 }}>+ Save</button>
            </div>
            {SAVED_RESOURCES.map((res, i) => (
              <div key={res.id} style={{ padding: '10px 16px', borderBottom: i < SAVED_RESOURCES.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, flex: 1, paddingRight: 8, lineHeight: 1.4 }}>{res.title}</div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                    <span style={{ fontSize: 9, background: `${typeColor(res.type)}20`, color: typeColor(res.type), borderRadius: 4, padding: '1px 5px' }}>{res.type}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{res.date}</span>
                  {res.tags.map(t => (
                    <span key={t} style={{ fontSize: 9, background: `${COLOR}15`, color: COLOR, borderRadius: 3, padding: '1px 4px' }}>{t}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Research projects */}
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--color-border)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Folder style={{ width: 13, height: 13, color: COLOR }} />Research Projects
              </div>
              {PROJECTS.map((proj, i) => (
                <div key={proj.id} style={{ padding: '10px 16px', borderBottom: i < PROJECTS.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3, flex: 1, paddingRight: 6 }}>{proj.name}</div>
                    <span style={{ fontSize: 9, background: `${proj.color}20`, color: proj.color, borderRadius: 4, padding: '1px 4px', flexShrink: 0 }}>{proj.count} items</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>{proj.desc}</div>
                </div>
              ))}
            </div>

            {/* Recent searches */}
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--color-border)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock style={{ width: 13, height: 13, color: COLOR }} />Recent Searches
              </div>
              {RECENT_SEARCHES.map((s, i) => (
                <div key={i} onClick={() => { setQuery(s); doSearch(s) }} style={{ padding: '9px 16px', borderBottom: i < RECENT_SEARCHES.length - 1 ? '1px solid var(--color-border)' : 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--color-text-muted)' }}>
                  <Search style={{ width: 11, height: 11, flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
