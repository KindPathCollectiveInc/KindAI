import { useState } from 'react';
import { raiseDeletionRequest } from '@/features/deletion-requests/api';
import type { DeletableTable } from '@/types/database';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthContext';

export function RequestDeletionButton({ tableName, recordId }: { tableName: DeletableTable; recordId: string }) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!profile || !reason.trim()) return;
    setSubmitting(true);
    try {
      await raiseDeletionRequest(tableName, recordId, reason.trim(), profile.id);
      setDone(true);
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return <p className="text-xs text-slate">Deletion requested — awaiting CEO/President review.</p>;
  }

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Request deletion
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg bg-sand-100 p-3">
      <textarea
        rows={2}
        placeholder="Why should this be deleted?"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button variant="danger" onClick={submit} disabled={submitting || !reason.trim()}>
          {submitting ? 'Submitting…' : 'Submit request'}
        </Button>
      </div>
    </div>
  );
}
