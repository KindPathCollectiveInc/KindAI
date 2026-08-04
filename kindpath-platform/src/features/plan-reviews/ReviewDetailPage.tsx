import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import {
  addParticipant,
  getReviewClinicalNote,
  listParticipants,
  PARTICIPANT_TYPE_LABELS,
  recordReviewOutcome,
  upsertReviewClinicalNote,
} from '@/features/plan-reviews/api';
import { listPeople } from '@/features/people/api';
import { supabase } from '@/lib/supabase';
import type { PlanReview, ReviewOutcome, ReviewParticipantType, ReviewSegment } from '@/types/database';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthContext';

const outcomeLabels: Record<ReviewOutcome, string> = {
  continue_unchanged: 'Continue unchanged',
  reduce: 'Reduce',
  eliminate: 'Eliminate',
  escalate: 'Escalate',
};

async function getReview(id: string): Promise<PlanReview> {
  const { data, error } = await supabase.from('plan_reviews').select('*').eq('id', id).single();
  if (error) throw error;
  return data as PlanReview;
}

export function ReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();

  const { data: review, loading: reviewLoading, reload: reloadReview } = useAsync(() => getReview(id!), [id]);
  const {
    data: clinicalNote,
    loading: noteLoading,
    reload: reloadNote,
  } = useAsync(() => getReviewClinicalNote(id!), [id]);
  const { data: participants, reload: reloadParticipants } = useAsync(() => listParticipants(id!), [id]);
  const { data: people } = useAsync(listPeople, []);

  const [outcome, setOutcome] = useState<ReviewOutcome>('continue_unchanged');
  const [participantInput, setParticipantInput] = useState('');
  const [savingOutcome, setSavingOutcome] = useState(false);

  const [clinicalDraft, setClinicalDraft] = useState('');
  const [editingClinical, setEditingClinical] = useState(false);
  const [savingClinical, setSavingClinical] = useState(false);

  const [participantType, setParticipantType] = useState<ReviewParticipantType>('participant');
  const [segment, setSegment] = useState<ReviewSegment>('both');
  const [internalId, setInternalId] = useState('');
  const [externalName, setExternalName] = useState('');
  const [externalRelationship, setExternalRelationship] = useState('');
  const [addingParticipant, setAddingParticipant] = useState(false);

  const canRecord = profile && ['admin', 'care_advocacy'].includes(profile.role);
  const canAttemptClinical = profile && ['admin', 'specialist'].includes(profile.role);

  if (reviewLoading) return <p className="text-sm text-slate">Loading…</p>;
  if (!review) return <p className="text-sm text-terracotta">Review not found, or you don't have access.</p>;

  async function saveOutcome() {
    if (!review) return;
    setSavingOutcome(true);
    try {
      await recordReviewOutcome(review.id, outcome, participantInput || null, null, null);
      reloadReview();
    } finally {
      setSavingOutcome(false);
    }
  }

  async function saveClinicalNote() {
    if (!review) return;
    setSavingClinical(true);
    try {
      await upsertReviewClinicalNote(review.id, clinicalDraft, clinicalNote?.id);
      setEditingClinical(false);
      reloadNote();
    } finally {
      setSavingClinical(false);
    }
  }

  async function handleAddParticipant() {
    if (!review) return;
    setAddingParticipant(true);
    try {
      await addParticipant({
        review_id: review.id,
        participant_type: participantType,
        attended_segment: segment,
        profile_id: internalId || null,
        external_name: externalName || null,
        external_relationship: externalRelationship || null,
      });
      setInternalId('');
      setExternalName('');
      setExternalRelationship('');
      reloadParticipants();
    } finally {
      setAddingParticipant(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-forest-700">
            Review — {new Date(review.scheduled_date).toLocaleDateString('en-AU')}
          </h1>
          <Badge tone={review.status === 'held' ? 'sage' : 'forest'}>{review.status}</Badge>
        </div>

        {canRecord && review.status !== 'held' && (
          <div className="mt-4 space-y-3 border-t border-sand-100 pt-3">
            <label className="block text-sm font-medium text-forest-700">
              Outcome
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as ReviewOutcome)}
                className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
              >
                {Object.entries(outcomeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-forest-700">
              Participant's own input
              <textarea
                rows={3}
                value={participantInput}
                onChange={(e) => setParticipantInput(e.target.value)}
                placeholder="What the participant (or their advocate) said, in their own words"
                className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
              />
            </label>
            <div className="flex justify-end">
              <Button onClick={saveOutcome} disabled={savingOutcome}>
                {savingOutcome ? 'Saving…' : 'Record outcome'}
              </Button>
            </div>
          </div>
        )}

        {review.status === 'held' && (
          <div className="mt-3 border-t border-sand-100 pt-3 text-sm">
            {review.outcome && (
              <p>
                <span className="font-medium text-forest-700">Outcome: </span>
                {outcomeLabels[review.outcome]}
              </p>
            )}
            {review.participant_input && (
              <p className="mt-2 whitespace-pre-wrap text-forest-700">{review.participant_input}</p>
            )}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-forest-700">Clinical discussion</h2>
        <p className="mt-1 text-xs text-slate">
          Same access boundary as the plan's formulation layer — engaged specialist, admin, or a
          scoped access grant.
        </p>

        {noteLoading && <p className="mt-3 text-sm text-slate">Loading…</p>}

        {!noteLoading && editingClinical && (
          <div className="mt-3 space-y-2">
            <textarea
              rows={4}
              value={clinicalDraft}
              onChange={(e) => setClinicalDraft(e.target.value)}
              className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditingClinical(false)}>
                Cancel
              </Button>
              <Button onClick={saveClinicalNote} disabled={savingClinical}>
                {savingClinical ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        )}

        {!noteLoading && !editingClinical && clinicalNote && (
          <>
            <p className="mt-3 whitespace-pre-wrap text-sm text-forest-700">{clinicalNote.clinical_summary}</p>
            {canAttemptClinical && (
              <Button
                variant="ghost"
                className="mt-2"
                onClick={() => {
                  setClinicalDraft(clinicalNote.clinical_summary);
                  setEditingClinical(true);
                }}
              >
                Edit
              </Button>
            )}
          </>
        )}

        {!noteLoading && !editingClinical && !clinicalNote && (
          <>
            <p className="mt-3 text-sm text-slate">Nothing recorded, or you don't have access to view it.</p>
            {canAttemptClinical && (
              <Button variant="secondary" className="mt-2" onClick={() => setEditingClinical(true)}>
                Add discussion notes
              </Button>
            )}
          </>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-forest-700">Attendance</h2>
        <p className="mb-3 text-xs text-slate">
          Who was present for the participant's own voice vs. the clinical/cross-service
          discussion — someone can appear in one, both, or neither.
        </p>

        {canRecord && (
          <div className="mb-4 space-y-2 rounded-lg bg-sand-100 p-3">
            <div className="grid grid-cols-2 gap-2">
              <select
                value={participantType}
                onChange={(e) => setParticipantType(e.target.value as ReviewParticipantType)}
                className="rounded-lg border border-sand-200 px-2 py-1.5 text-sm"
              >
                {Object.entries(PARTICIPANT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                value={segment}
                onChange={(e) => setSegment(e.target.value as ReviewSegment)}
                className="rounded-lg border border-sand-200 px-2 py-1.5 text-sm"
              >
                <option value="both">Both segments</option>
                <option value="participant_voice">Participant-voice only</option>
                <option value="clinical_discussion">Clinical discussion only</option>
              </select>
            </div>
            <select
              value={internalId}
              onChange={(e) => {
                setInternalId(e.target.value);
                if (e.target.value) setExternalName('');
              }}
              className="w-full rounded-lg border border-sand-200 px-2 py-1.5 text-sm"
            >
              <option value="">— or pick a staff member —</option>
              {(people ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
            {!internalId && (
              <div className="grid grid-cols-2 gap-2">
                <input
                  placeholder="External person's name"
                  value={externalName}
                  onChange={(e) => setExternalName(e.target.value)}
                  className="rounded-lg border border-sand-200 px-2 py-1.5 text-sm"
                />
                <input
                  placeholder="Relationship (e.g. sister, advocate)"
                  value={externalRelationship}
                  onChange={(e) => setExternalRelationship(e.target.value)}
                  className="rounded-lg border border-sand-200 px-2 py-1.5 text-sm"
                />
              </div>
            )}
            <div className="flex justify-end">
              <Button
                variant="secondary"
                onClick={handleAddParticipant}
                disabled={addingParticipant || (!internalId && !externalName.trim())}
              >
                {addingParticipant ? 'Adding…' : 'Add attendee'}
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-1">
          {(participants ?? []).map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm">
              <span className="text-forest-700">
                {p.external_name ?? people?.find((person) => person.id === p.profile_id)?.full_name ?? 'Unknown'}
                <span className="ml-2 text-xs text-slate">{PARTICIPANT_TYPE_LABELS[p.participant_type]}</span>
              </span>
              <Badge tone="slate">{p.attended_segment.replace('_', ' ')}</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
