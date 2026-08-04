import { type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth } from '@/features/auth/AuthContext';
import type { ProfileRole } from '@/types/database';

interface NavItem {
  to: string;
  label: string;
  allow?: ProfileRole[];
}

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/clients', label: 'Clients' },
  { to: '/roster', label: 'Roster' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/messages', label: 'Messages' },
  { to: '/documents', label: 'Documents' },
  { to: '/people', label: 'People' },
  { to: '/incidents', label: 'Incidents' },
  { to: '/risk-register', label: 'Risk register', allow: ['admin', 'care_advocacy', 'committee'] },
  { to: '/escalations', label: 'Escalations', allow: ['admin', 'care_advocacy', 'committee'] },
  { to: '/finances', label: 'Finances', allow: ['admin', 'care_advocacy', 'committee'] },
  { to: '/deletion-requests', label: 'Deletion requests', allow: ['admin', 'care_advocacy', 'committee'] },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const visibleItems = navItems.filter((item) => !item.allow || (profile && item.allow.includes(profile.role)));

  return (
    <div className="flex min-h-screen bg-sand">
      <aside className="flex w-60 flex-col border-r border-sand-200 bg-white/60 px-4 py-6">
        <div className="mb-8 px-2">
          <p className="text-lg font-semibold text-forest-700">KindPath</p>
          <p className="text-xs text-slate">Operations Platform</p>
        </div>

        <nav className="flex-1 space-y-1">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                clsx(
                  'block rounded-lg px-3 py-2 text-sm font-medium transition',
                  isActive ? 'bg-forest-50 text-forest-700' : 'text-slate hover:bg-sand-100',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-6 border-t border-sand-200 pt-4">
          <p className="truncate px-2 text-sm font-medium text-forest-700">{profile?.full_name}</p>
          <p className="px-2 text-xs capitalize text-slate">{profile?.role.replace('_', ' ')}</p>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              navigate('/login');
            }}
            className="mt-3 w-full rounded-lg px-3 py-2 text-left text-sm text-slate hover:bg-sand-100"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto px-8 py-8">{children}</main>
    </div>
  );
}
