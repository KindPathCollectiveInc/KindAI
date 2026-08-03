import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { listClients } from '@/features/clients/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthContext';

export function ClientsListPage() {
  const { data: clients, loading, error } = useAsync(listClients, []);
  const [query, setQuery] = useState('');
  const { profile } = useAuth();
  const canCreate = profile && ['admin', 'care_advocacy', 'committee'].includes(profile.role);

  const filtered = (clients ?? []).filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-forest-700">Clients</h1>
          <p className="text-sm text-slate">
            Every participant record — the single source of truth this platform is built around.
          </p>
        </div>
        {canCreate && (
          <Link to="/clients/new">
            <Button>New client</Button>
          </Link>
        )}
      </div>

      <input
        type="search"
        placeholder="Search clients…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-4 w-full max-w-sm rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm focus:border-forest focus:outline-none"
      />

      {loading && <p className="text-sm text-slate">Loading…</p>}
      {error && <p className="text-sm text-terracotta">{error}</p>}

      {!loading && filtered.length === 0 && (
        <Card>
          <p className="text-sm text-slate">
            No clients visible yet. If you're a contractor, you'll only see clients you're
            currently rostered to support.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((client) => (
          <Link key={client.id} to={`/clients/${client.id}`}>
            <Card className="h-full transition hover:border-forest">
              <div className="flex items-start justify-between">
                <p className="font-medium text-forest-700">{client.name}</p>
                <Badge tone={client.status === 'active' ? 'sage' : 'slate'}>{client.status}</Badge>
              </div>
              {client.ndis_number && (
                <p className="mt-1 text-xs text-slate">NDIS {client.ndis_number}</p>
              )}
              {client.support_coordinator && (
                <p className="mt-2 text-sm text-slate">Coordinator: {client.support_coordinator}</p>
              )}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
