/**
 * EditorPane — displays file content with syntax highlighting via
 * a simple HTML pre/code approach. No heavy editor dependency here;
 * the full Monaco integration can be added later when disk space allows.
 * Supports editing and saving back to the backend.
 */
import { useState, useEffect, useCallback } from 'react'
import { Save, X, RefreshCw } from 'lucide-react'

interface Tab {
  path: string
  name: string
  content: string
  dirty: boolean
}

interface Props {
  tabs: Tab[]
  activeTab: string | null
  onClose: (path: string) => void
  onActivate: (path: string) => void
  onSave: (path: string, content: string) => void
}

function langFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', cpp: 'cpp', c: 'c', h: 'c',
    css: 'css', html: 'html', json: 'json', md: 'markdown',
    sh: 'bash', yaml: 'yaml', yml: 'yaml', toml: 'toml',
  }
  return map[ext] ?? 'plaintext'
}

export default function EditorPane({ tabs, activeTab, onClose, onActivate, onSave }: Props) {
  const tab = tabs.find(t => t.path === activeTab) ?? null
  const [editContent, setEditContent] = useState('')

  useEffect(() => {
    if (tab) setEditContent(tab.content)
  }, [activeTab, tab?.content])

  const save = useCallback(() => {
    if (!tab) return
    onSave(tab.path, editContent)
  }, [tab, editContent, onSave])

  // Ctrl+S / Cmd+S save
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save])

  if (tabs.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.2 }}>{'</>'}</div>
          <div style={{ fontSize: 14 }}>Open a file from the explorer</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Tab bar */}
      <div className="tabbar">
        {tabs.map(t => (
          <div
            key={t.path}
            className={`tab ${t.path === activeTab ? 'active' : ''}`}
            onClick={() => onActivate(t.path)}
          >
            {t.dirty && <span style={{ color: 'var(--amber)', fontSize: 8 }}>●</span>}
            <span>{t.name}</span>
            <span
              className="tab-close"
              onClick={e => { e.stopPropagation(); onClose(t.path) }}
            >×</span>
          </div>
        ))}
      </div>

      {/* Editor */}
      {tab && (
        <div className="editor-area" style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Toolbar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 12px', borderBottom: '1px solid var(--border)',
            background: 'var(--bg-surface)', flexShrink: 0,
          }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tab.path}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', background: 'var(--bg-panel)', padding: '2px 6px', borderRadius: 3 }}>
              {langFromName(tab.name)}
            </span>
            <button className="btn btn-ghost" style={{ padding: '3px 8px' }} onClick={save}>
              <Save size={12} /> Save
            </button>
          </div>

          {/* Textarea editor */}
          <textarea
            className="mono code-view"
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            style={{
              flex: 1,
              background: 'var(--bg)',
              color: '#d4d4d4',
              border: 'none',
              outline: 'none',
              resize: 'none',
              padding: '16px 24px',
              tabSize: 2,
            }}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
          />
        </div>
      )}
    </div>
  )
}
