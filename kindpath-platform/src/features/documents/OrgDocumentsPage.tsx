import { useState, type FormEvent } from 'react';
import { useAsync } from '@/hooks/useAsync';
import {
  CATEGORY_LABELS,
  createDocument,
  getDocumentFileUrl,
  listOrgDocuments,
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

export function OrgDocumentsPage() {
  const { profile } = useAuth();
  const { data: documents, loading, reload } = useAsync(listOrgDocuments, []);
  const [showForm, setShowForm] = useState(false);
  const canApprove = profile && ['admin', 'care_advocacy'].includes(profile.role);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-forest-700">Documents</h1>
          <p className="text-sm text-slate">Policies, induction packs, and other organisation-wide files.</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Close' : 'Add document'}</Button>
      </div>

      {showForm && (
        <UploadForm
          onCreated={() => {
            setShowForm(false);
            reload();
          }}
        />
      )}

      {loading && <p className="text-sm text-slate">Loading…</p>}

      <div className="space-y-2">
        {(documents ?? []).map((d) => (
          <Card key={d.id}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-forest-700">{d.title}</p>
                <div className="mt-1 flex items-center gap-2">
                  <DocumentCategoryBadge category={d.category} />
                  <Badge tone={statusTone[d.status]}>{d.status.replace('_', ' ')}</Badge>
                </div>
              </div>
              {d.file_path && (
                <Button
                  variant="ghost"
                  onClick={async () => {
                    const url = await getDocumentFileUrl(d.file_path!);
                    window.open(url, '_blank', 'noopener');
                  }}
                >
                  View
                </Button>
              )}
            </div>
            {canApprove && d.status !== 'approved' && (
              <div className="mt-2 flex justify-end gap-2 border-t border-sand-100 pt-2">
                {d.status === 'draft' && (
                  <Button variant="ghost" onClick={() => updateDocumentStatus(d.id, 'pending_approval').then(reload)}>
                    Submit for approval
                  </Button>
                )}
                {d.status === 'pending_approval' && profile && (
                  <Button variant="secondary" onClick={() => updateDocumentStatus(d.id, 'approved', profile.id).then(reload)}>
                    Approve
                  </Button>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function UploadForm({ onCreated }: { onCreated: () => void }) {
  const { profile } = useAuth();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('policy');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSubmitting(true);
    try {
      const doc = await createDocument({ title, category, uploader_id: profile.id });
      if (file) await uploadDocumentFile(doc, file);
      onCreated();
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
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm" />
        </label>
        <div className="flex justify-end">
          <Button type="submit" disabled={submitting || !title.trim()}>
            {submitting ? 'Saving…' : 'Add document'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
