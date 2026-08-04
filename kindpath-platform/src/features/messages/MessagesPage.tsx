import { useState, type FormEvent } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { listMessages, postMessage } from '@/features/messages/api';
import { listPeople } from '@/features/people/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthContext';

export function MessagesPage() {
  const { profile } = useAuth();
  const { data: messages, loading, reload } = useAsync(listMessages, []);
  const { data: people } = useAsync(listPeople, []);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const authorName = (id: string) => people?.find((p) => p.id === id)?.full_name ?? 'Someone';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile || !text.trim()) return;
    setSubmitting(true);
    try {
      await postMessage(profile.id, text.trim());
      setText('');
      reload();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-semibold text-forest-700">Team messages</h1>
      <p className="mb-6 text-sm text-slate">A shared noticeboard for the team.</p>

      <Card className="mb-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            rows={3}
            placeholder="Post something the team should know…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={submitting || !text.trim()}>
              {submitting ? 'Posting…' : 'Post'}
            </Button>
          </div>
        </form>
      </Card>

      {loading && <p className="text-sm text-slate">Loading…</p>}

      <div className="space-y-3">
        {(messages ?? []).map((m) => (
          <Card key={m.id}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-forest-700">{authorName(m.author_id)}</p>
              <p className="text-xs text-slate">{new Date(m.date).toLocaleString('en-AU')}</p>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-forest-700">{m.text}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
