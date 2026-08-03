import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/hooks/useAsync';

// Deliberately a standalone, minimal-surface-area route: no app shell, no
// sidebar, no auth — it renders exactly what get_coordinated_summary()
// returns and nothing else. See supabase/migrations/..._share_summary_and_storage.sql
// for the server-side guarantee that this is the only data an anonymous
// caller can ever reach.
export function CoordinatedSummaryPage() {
  const { token } = useParams<{ token: string }>();

  const { data: summary, loading, error } = useAsync(async () => {
    const { data, error } = await supabase.rpc('get_coordinated_summary', { p_token: token! });
    if (error) throw error;
    return data;
  }, [token]);

  return (
    <div className="min-h-screen bg-sand px-4 py-10">
      <div className="mx-auto max-w-xl rounded-2xl border border-sand-200 bg-white p-6 shadow-sm">
        <p className="text-xs uppercase tracking-wide text-slate">KindPath Collective</p>
        <h1 className="mt-1 text-xl font-semibold text-forest-700">Coordinated summary</h1>

        {loading && <p className="mt-6 text-sm text-slate">Loading…</p>}
        {error && (
          <p className="mt-6 text-sm text-terracotta">
            Something went wrong loading this summary.
          </p>
        )}
        {!loading && !error && !summary && (
          <p className="mt-6 text-sm text-terracotta">
            This link is invalid, has expired, or has been revoked. Please contact KindPath
            Collective directly for up-to-date information.
          </p>
        )}

        {summary && (
          <div className="mt-6 space-y-5">
            <p className="text-lg font-medium text-forest-700">{summary.name}</p>

            <SummarySection label="Routines" value={summary.routines} />
            <SummarySection label="Communication preferences" value={summary.communication_preferences} />
            <SummarySection label="Goals" value={summary.goals} />
            <SummarySection label="Care plan" value={summary.care_plan} />

            <p className="border-t border-sand-100 pt-4 text-xs text-slate">
              This is a read-only summary shared by KindPath Collective Inc. It contains only the
              information the participant/coordinator has consented to share with you, and can be
              revoked at any time.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SummarySection({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-forest-700">{value}</p>
    </div>
  );
}
