import { useState } from 'react'
import {
  LayoutDashboard, Users, FileText, DollarSign, ShieldCheck,
  UserCheck, Heart, Settings,
} from 'lucide-react'
import Dashboard from './components/Dashboard'
import Participants from './components/Participants'
import CaseNotes from './components/CaseNotes'
import Billing from './components/Billing'
import Compliance from './components/Compliance'
import WorkerRoster from './components/WorkerRoster'
import ParticipantHub from './components/ParticipantHub'

type Panel = 'dashboard' | 'participants' | 'casenotes' | 'billing' | 'compliance' | 'workers' | 'participant-hub'

const NAV_PROVIDER = [
  { id: 'dashboard',     label: 'Dashboard',       Icon: LayoutDashboard, color: '#38bdf8' },
  { id: 'participants',  label: 'Participants',     Icon: Users,           color: '#60a5fa' },
  { id: 'casenotes',     label: 'Case Notes',       Icon: FileText,        color: '#a78bfa' },
  { id: 'billing',       label: 'Billing',          Icon: DollarSign,      color: '#34d399' },
  { id: 'compliance',    label: 'Compliance',       Icon: ShieldCheck,     color: '#fbbf24' },
] as const

const NAV_KINDCARE = [
  { id: 'workers',         label: 'Workers',          Icon: UserCheck, color: '#86efac' },
  { id: 'participant-hub', label: 'Participant Hub',  Icon: Heart,     color: '#f472b6' },
] as const

const PANEL_LABELS: Record<Panel, string> = {
  dashboard: 'Dashboard',
  participants: 'Participants',
  casenotes: 'Case Notes',
  billing: 'Billing',
  compliance: 'Compliance',
  workers: 'Workers',
  'participant-hub': 'Participant Hub',
}

export default function App() {
  const [panel, setPanel] = useState<Panel>('dashboard')

  function NavItem({ id, label, Icon, color }: { id: string; label: string; Icon: any; color: string }) {
    const active = panel === id
    return (
      <button
        className={`nav-item ${active ? 'nav-item-active' : ''}`}
        onClick={() => setPanel(id as Panel)}
      >
        <Icon size={15} color={active ? color : undefined} strokeWidth={1.8} />
        {label}
      </button>
    )
  }

  return (
    <div className="app-root">
      {/* Sidebar */}
      <aside className="sidebar">
        {/* Logo — draggable titlebar area */}
        <div className="logo-area" style={{ WebkitAppRegion: 'drag' } as any}>
          <div className="logo-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L3 7v10l9 5 9-5V7L12 2z" stroke="#38bdf8" strokeWidth="2" strokeLinejoin="round"/>
              <path d="M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0 -6 0" fill="#38bdf8" opacity=".5"/>
            </svg>
          </div>
          <span className="logo-text">
            Ki<span style={{ color: '#38bdf8' }}>NDIS</span>
          </span>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">Provider</div>
          {NAV_PROVIDER.map(item => <NavItem key={item.id} {...item} />)}

          <div style={{ margin: '10px 8px', borderTop: '1px solid var(--color-border)' }} />

          <div className="nav-section">KindCare</div>
          {NAV_KINDCARE.map(item => <NavItem key={item.id} {...item} />)}
        </nav>

        <div className="sidebar-bottom">
          <button className={`nav-item ${panel === 'settings' ? 'nav-item-active' : ''}`} style={{ width: '100%' }}>
            <Settings size={15} strokeWidth={1.8} />
            Settings
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="main-area">
        {/* Topbar */}
        <header className="topbar" style={{ WebkitAppRegion: 'drag' } as any}>
          <span className="topbar-title">{PANEL_LABELS[panel]}</span>
        </header>

        {/* Panel content */}
        <main className="panel-content" style={{ WebkitAppRegion: 'no-drag' } as any}>
          {panel === 'dashboard'      && <Dashboard />}
          {panel === 'participants'   && <Participants />}
          {panel === 'casenotes'      && <CaseNotes />}
          {panel === 'billing'        && <Billing />}
          {panel === 'compliance'     && <Compliance />}
          {panel === 'workers'        && <WorkerRoster />}
          {panel === 'participant-hub'&& <ParticipantHub />}
        </main>
      </div>
    </div>
  )
}
