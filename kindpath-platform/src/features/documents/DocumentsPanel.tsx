import { useState, type FormEvent } from 'react';
import { useAsync } from '@/hooks/useAsync';
import {
  CATEGORY_LABELS,
  createDocument,
  getDocumentFileUrl,
  listDocumentsForClient,
  updateDocumentStatus,
  uploadDocumentFile,
} from '@/features/documents/api';
import type { DocumentCategory } from '@/types/database';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DocumentCategoryBadge } from '@/components/ui/DocumentCategoryBadge';
import { useAuth } from '@/features/auth/AuthContext';

const statusTone: Record<string, 'terracotta' | 'sage' | 'slate'> = {
  draft: 'slate',
  pending_approval: 'terracotta',
  approved: 'sage',
};

export function DocumentsPanel({ clientId }: { clientId: string }) {
  const { profile } = useAuth();
  const { data: documents, loading, reload } = useAsync(() => listDocumentsForClient(clientId), [clientId]);
  const [showForm, setShowForm] = useState(false);
  const canApprove = profile && ['admin', 'care_advocacy'].includes(profile.role);

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-forest-700">Documents</h2>
        <Button variant="secondary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Close' : 'Add document'}
        </Button>
      </div>

      {showForm && (
        <UploadForm
          clientId={clientId}
          onCreated={() => {
            setShowForm(false);
            reload();
          }}
        />
      )}

      {loading && <p className="text-sm text-slate">Loading…</p>}
      {!loading && (documents ?? []).length === 0 && <p className="text-sm text-slate">No documents yet.</p>}

      <div className="space-y-2">
        {(documents ?? []).map((d) => (
          <div key={d.id} className="rounded-lg border border-sand-100 p-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-forest-700">{d.title}</p>
                <div className="mt-1 flex items-center gap-2">
                  <DocumentCategoryBadge category={d.category} />
                  <Badge tone={statusTone[d.status]}>{d.status.replace('_', ' ')}</Badge>
                </div>
              </div>
            </div>

            {d.category === 'bsp_risk_plan' && (
              <p className="mt-2 rounded-lg bg-clay px-2 py-1 text-xs text-terracotta">
                ⚠ Behaviour Support Plan / Risk Plan — handle with the care this category requires.
              </p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {d.file_path && (
                <Button
                  variant="ghost"
                  onClick={async () => {
                    const url = await getDocumentFileUrl(d.file_path!);
                    window.open(url, '_blank', 'noopener');
                  }}
                >
                  View file
                </Button>
              )}
              {canApprove && d.status === 'draft' && (
                <Button
                  variant="ghost"
                  onClick={() => updateDocumentStatus(d.id, 'pending_approval').then(reload)}
                >
                  Submit for approval
                </Button>
              )}
              {canApprove && d.status === 'pending_approval' && profile && (
                <Button
                  variant="secondary"
                  onClick={() => updateDocumentStatus(d.id, 'approved', profile.id).then(reload)}
                >
                  Approve
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function UploadForm({ clientId, onCreated }: { clientId: string; onCreated: () => void }) {
  const { profile } = useAuth();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('other');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSubmitting(true);
    setError(null);
    try {
      const doc = await createDocument({ title, category, client_id: clientId, uploader_id: profile.id });
      if (file) await uploadDocumentFile(doc, file);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mb-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block text-sm font-medium text-forest-700">
          Title
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm font-medium text-forest-700">
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as DocumentCategory)}
            className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
          >
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-forest-700">
          File (optional)
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm"
          />
        </label>
        {error && <p className="text-sm text-terracotta">{error}</p>}
        <div className="flex justify-end">
          <Button type="submit" disabled={submitting || !title.trim()}>
            {submitting ? 'Saving…' : 'Add document'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
