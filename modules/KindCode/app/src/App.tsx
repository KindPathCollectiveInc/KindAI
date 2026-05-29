/**
 * KindCode — standalone IDE for the KindPath ecosystem.
 * Layout: sidebar file tree | editor + terminal | AI assistant panel
 * Color: #a78bfa (purple)
 */
import { useState, useCallback } from 'react'
import { Code2, PanelRightOpen, PanelRightClose, TerminalSquare } from 'lucide-react'
import FileTree from './components/FileTree'
import EditorPane from './components/EditorPane'
import TerminalPanel from './components/Terminal'
import AISession from './components/AISession'

interface Tab {
  path: string
  name: string
  content: string
  dirty: boolean
}

export default function App() {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [showAI, setShowAI] = useState(true)
  const [showTerminal, setShowTerminal] = useState(true)

  const openFile = useCallback(async (path: string, name: string) => {
    // If already open, just activate
    const existing = tabs.find(t => t.path === path)
    if (existing) { setActiveTab(path); return }

    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`)
      if (!res.ok) return
      const data = await res.json()
      const newTab: Tab = { path, name, content: data.content ?? '', dirty: false }
      setTabs(prev => [...prev, newTab])
      setActiveTab(path)
    } catch {}
  }, [tabs])

  const closeTab = useCallback((path: string) => {
    setTabs(prev => {
      const next = prev.filter(t => t.path !== path)
      if (activeTab === path) {
        setActiveTab(next.length > 0 ? next[next.length - 1].path : null)
      }
      return next
    })
  }, [activeTab])

  const saveFile = useCallback(async (path: string, content: string) => {
    try {
      await fetch('/api/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content }),
      })
      setTabs(prev => prev.map(t => t.path === path ? { ...t, content, dirty: false } : t))
    } catch {}
  }, [])

  const activeTabData = tabs.find(t => t.path === activeTab)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)' }}>
      {/* Topbar */}
      <div className="topbar">
        <Code2 size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
        <span className="topbar-logo">Kind<span>Code</span></span>
        <div style={{ flex: 1 }} />
        <button
          className="btn btn-ghost"
          style={{ padding: '3px 8px', gap: 4 }}
          onClick={() => setShowTerminal(v => !v)}
          title="Toggle terminal"
        >
          <TerminalSquare size={13} />
        </button>
        <button
          className="btn btn-ghost"
          style={{ padding: '3px 8px', gap: 4 }}
          onClick={() => setShowAI(v => !v)}
          title="Toggle AI panel"
        >
          {showAI ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />}
        </button>
      </div>

      {/* Main layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* File tree */}
        <div className="sidebar">
          <FileTree onOpenFile={openFile} activeFile={activeTab ?? undefined} />
        </div>

        {/* Centre: editor + terminal */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <EditorPane
            tabs={tabs}
            activeTab={activeTab}
            onClose={closeTab}
            onActivate={setActiveTab}
            onSave={saveFile}
          />
          {showTerminal && (
            <TerminalPanel cwd={activeTabData?.path?.split('/').slice(0, -1).join('/') || undefined} />
          )}
        </div>

        {/* AI panel */}
        {showAI && (
          <AISession
            activeFile={activeTabData?.path}
            activeContent={activeTabData?.content}
          />
        )}
      </div>

      {/* Status bar */}
      <div className="statusbar">
        <span className="statusbar-item">
          <Code2 size={10} /> KindCode
        </span>
        {activeTabData && (
          <>
            <span>|</span>
            <span className="statusbar-item">
              {activeTabData.name}
              {activeTabData.dirty && ' ●'}
            </span>
          </>
        )}
        <div style={{ flex: 1 }} />
        <span className="statusbar-item">KindPath Collective</span>
      </div>
    </div>
  )
}
