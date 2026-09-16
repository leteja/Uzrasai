"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Copy, Lock, LockOpen } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_SPEAKERS,
  type SavedMeeting,
  type SpeakerId,
  applySpeakerNamesToSummary,
  defaultSpeakerLabel,
  formatTimestamp,
  hasCustomSpeakerName,
  expectedSpeakerIds,
  finalizeSummary,
  manualEditNotice,
  normalizeMeetingTitle,
  speakerName,
  speakerTone,
  toMarkdown,
  toSummaryCopyText,
  toTranscriptCopyText,
  withSpeakerCount,
} from "@/lib/meeting";

function speakerChoices(saved: SavedMeeting): SpeakerId[] {
  return expectedSpeakerIds(saved.result.segments, saved.expectedCount);
}

export function ProtocolDocument({
  saved,
  onUpdate,
  onLock,
  onUnlock,
}: {
  saved: SavedMeeting;
  onUpdate: (next: SavedMeeting, options?: { nameSync?: boolean }) => void;
  onLock: (snapshot?: SavedMeeting) => void;
  onUnlock: () => void;
}) {
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [draftNarrative, setDraftNarrative] = useState(saved.result.summary.narrative);
  const [draftSegments, setDraftSegments] = useState(saved.result.segments);
  const summaryFlushTimer = useRef<number | null>(null);
  const segmentFlushTimer = useRef<number | null>(null);
  const locked = saved.locked;
  const names = saved.speakerNames;
  const speakers = expectedSpeakerIds(saved.result.segments, saved.expectedCount);
  const choices = speakerChoices(saved);
  const result = saved.result;
  const editNotice = manualEditNotice(saved.manuallyEdited, saved.editedAt);

  useEffect(() => {
    setDraftNarrative(saved.result.summary.narrative);
    setDraftSegments(saved.result.segments);
  }, [saved.id]);

  useEffect(() => {
    if (locked) {
      setDraftNarrative(result.summary.narrative);
      setDraftSegments(result.segments);
    }
  }, [locked, result.summary.narrative, result.segments]);

  useEffect(() => {
    return () => {
      if (summaryFlushTimer.current) window.clearTimeout(summaryFlushTimer.current);
      if (segmentFlushTimer.current) window.clearTimeout(segmentFlushTimer.current);
    };
  }, []);

  function commit(next: SavedMeeting, options?: { nameSync?: boolean }) {
    onUpdate(
      {
        ...next,
        markdown: toMarkdown(
          next.result,
          next.speakerNames,
          next.participants,
          next.expectedCount,
          next.locked,
          next.manuallyEdited,
          next.editedAt
        ),
      },
      options
    );
  }

  function markManualEdit(next: SavedMeeting): SavedMeeting {
    return {
      ...next,
      manuallyEdited: true,
      editedAt: new Date().toISOString(),
    };
  }

  function patchSummary(patch: Partial<typeof result.summary>) {
    if (locked) return;
    commit(
      markManualEdit({
        ...saved,
        result: {
          ...result,
          summary: { ...result.summary, ...patch },
        },
      })
    );
  }

  function flushSummaryDraft(narrative: string) {
    if (locked || narrative === result.summary.narrative) return;
    patchSummary({ narrative });
  }

  function scheduleSummaryFlush(narrative: string) {
    if (summaryFlushTimer.current) window.clearTimeout(summaryFlushTimer.current);
    summaryFlushTimer.current = window.setTimeout(() => flushSummaryDraft(narrative), 450);
  }

  function patchSegment(index: number, patch: { text?: string; speaker?: SpeakerId }) {
    if (locked) return;
    const segments = result.segments.map((segment, i) => (i === index ? { ...segment, ...patch } : segment));
    const nextSegments = draftSegments.map((segment, i) => (i === index ? { ...segment, ...patch } : segment));
    setDraftSegments(nextSegments);
    commit(
      markManualEdit({
        ...saved,
        result: withSpeakerCount({ ...result, segments }),
      })
    );
  }

  function flushSegmentDrafts(segments: typeof draftSegments) {
    if (locked) return;
    const changed = segments.some((segment, index) => segment.text !== result.segments[index]?.text);
    if (!changed) return;
    commit(
      markManualEdit({
        ...saved,
        result: withSpeakerCount({ ...result, segments }),
      })
    );
  }

  function scheduleSegmentFlush(segments: typeof draftSegments) {
    if (segmentFlushTimer.current) window.clearTimeout(segmentFlushTimer.current);
    segmentFlushTimer.current = window.setTimeout(() => flushSegmentDrafts(segments), 450);
  }

  function updateSegmentText(index: number, text: string) {
    if (locked) return;
    const nextSegments = draftSegments.map((segment, i) => (i === index ? { ...segment, text } : segment));
    setDraftSegments(nextSegments);
    scheduleSegmentFlush(nextSegments);
  }

  function patchSegmentSpeaker(index: number, speaker: SpeakerId) {
    patchSegment(index, { speaker });
  }

  function patchName(speaker: SpeakerId, name: string) {
    if (summaryFlushTimer.current) {
      window.clearTimeout(summaryFlushTimer.current);
      summaryFlushTimer.current = null;
    }
    flushSummaryDraft(draftNarrative);

    const nextNames = { ...names, [speaker]: name };
    const summaryBase = { ...result.summary, narrative: draftNarrative };
    commit(
      {
        ...saved,
        speakerNames: nextNames,
        result: {
          ...result,
          summary: finalizeSummary(
            applySpeakerNamesToSummary(summaryBase, nextNames, names),
            result.segments,
            nextNames
          ),
        },
      },
      { nameSync: true }
    );
    setDraftNarrative(
      finalizeSummary(
        applySpeakerNamesToSummary(summaryBase, nextNames, names),
        result.segments,
        nextNames
      ).narrative
    );
  }

  function handleLock() {
    if (summaryFlushTimer.current) {
      window.clearTimeout(summaryFlushTimer.current);
      summaryFlushTimer.current = null;
    }
    if (segmentFlushTimer.current) {
      window.clearTimeout(segmentFlushTimer.current);
      segmentFlushTimer.current = null;
    }

    const hasSummaryChange = draftNarrative !== result.summary.narrative;
    const hasSegmentChange = draftSegments.some(
      (segment, index) => segment.text !== result.segments[index]?.text
    );
    const snapshot =
      hasSummaryChange || hasSegmentChange
        ? markManualEdit({
            ...saved,
            result: withSpeakerCount({
              ...result,
              segments: draftSegments,
              summary: { ...result.summary, narrative: draftNarrative },
            }),
          })
        : saved;

    if (snapshot !== saved) {
      commit(snapshot);
    }
    onLock(snapshot);
  }

  async function copySummary() {
    await navigator.clipboard.writeText(
      toSummaryCopyText(result, saved.createdAt, saved.manuallyEdited, saved.editedAt)
    );
    setCopiedSummary(true);
    window.setTimeout(() => setCopiedSummary(false), 1600);
  }

  async function copyTranscript() {
    await navigator.clipboard.writeText(
      toTranscriptCopyText(result, names, saved.createdAt, saved.manuallyEdited, saved.editedAt)
    );
    setCopiedTranscript(true);
    window.setTimeout(() => setCopiedTranscript(false), 1600);
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <h2 className="font-heading text-2xl leading-snug text-balance">
            {normalizeMeetingTitle(result.summary.title)}
          </h2>
          {saved.summaryInstructions ? (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground">
              <span className="font-medium text-foreground">Instrukcijos: </span>
              {saved.summaryInstructions}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void copySummary()}>
            {copiedSummary ? <Check /> : <Copy />}
            Kopijuoti tekstą
          </Button>
          <Button variant="outline" onClick={() => void copyTranscript()}>
            {copiedTranscript ? <Check /> : <Copy />}
            Kopijuoti visą pokalbį
          </Button>
          {locked ? (
            <Button variant="outline" onClick={onUnlock}>
              <LockOpen />
              Atrakinti
            </Button>
          ) : (
            <Button variant="outline" onClick={handleLock}>
              <Lock />
              Užrakinti
            </Button>
          )}
        </div>
      </div>

      {editNotice ? (
        <Alert>
          <AlertTriangle />
          <AlertTitle>Rankinis pakeitimas</AlertTitle>
          <AlertDescription>{editNotice}</AlertDescription>
        </Alert>
      ) : null}

      {!locked ? (
        <p className="text-xs text-muted-foreground">
          Redaguojant tekstą ranka, rezultatas bus pažymėtas kaip pakeistas.
        </p>
      ) : null}

      <div className="space-y-2">
        <p className="text-sm font-medium">Vardai</p>
        <p className="text-xs text-muted-foreground">
          Priskirkite vardą — jis atsiras aprašyme ir transkripte. Vardus galima keisti ir kai protokolas užrakintas.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {speakers.map((speaker) => (
            <div key={speaker} className="space-y-1">
              <Label htmlFor={`name-${speaker}`} className="text-xs">
                {defaultSpeakerLabel(speaker)}
              </Label>
              <Input
                id={`name-${speaker}`}
                placeholder="Vardas ar pravardė"
                value={names[speaker] ?? ""}
                onChange={(event) => patchName(speaker, event.target.value)}
              />
            </div>
          ))}
        </div>
      </div>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Sutrumpinimas</TabsTrigger>
          <TabsTrigger value="transcript">Visas pokalbis</TabsTrigger>
        </TabsList>
        <TabsContent value="summary" className="space-y-4 pt-4">
          <div className="space-y-1.5">
            <Label htmlFor="narrative">Aprašymas</Label>
            {locked ? (
              <div className="min-h-40 rounded-md border border-border/80 bg-muted/20 px-3 py-3 text-sm leading-7 whitespace-pre-wrap">
                {result.summary.narrative}
              </div>
            ) : (
              <Textarea
                id="narrative"
                value={draftNarrative}
                onChange={(event) => {
                  const narrative = event.target.value;
                  setDraftNarrative(narrative);
                  scheduleSummaryFlush(narrative);
                }}
                onBlur={() => flushSummaryDraft(draftNarrative)}
                className="min-h-40 leading-7"
              />
            )}
          </div>
        </TabsContent>
        <TabsContent value="transcript" className="space-y-3 pt-4">
          {(locked ? result.segments : draftSegments).map((segment, index) => {
            const tone = speakerTone(segment.speaker);
            const customName = hasCustomSpeakerName(segment.speaker, names);
            const segmentText = locked ? segment.text : (draftSegments[index]?.text ?? segment.text);
            return (
              <article key={`${segment.startMs}-${index}`} className="rounded-md border border-border/80 bg-muted/20 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground">{formatTimestamp(segment.startMs)}</span>
                  {!customName ? (
                    <>
                      <label className="sr-only" htmlFor={`speaker-${index}`}>
                        Kalbėtojas
                      </label>
                      {locked ? (
                        <span className="text-xs font-medium" style={{ color: tone.fg }}>
                          {speakerName(segment.speaker, names)}
                        </span>
                      ) : (
                        <select
                          id={`speaker-${index}`}
                          value={segment.speaker}
                          aria-label="Priskirti kitam kalbėtojui"
                          onChange={(event) => patchSegmentSpeaker(index, event.target.value as SpeakerId)}
                          className="h-7 max-w-full rounded-md border border-input bg-background px-2 text-xs"
                          style={{ color: tone.fg }}
                        >
                          {choices.map((id) => (
                            <option key={id} value={id}>
                              {speakerName(id, names)}
                            </option>
                          ))}
                        </select>
                      )}
                    </>
                  ) : null}
                </div>
                {locked ? (
                  customName ? (
                    <p className="text-sm leading-6 whitespace-pre-wrap">
                      <span className="font-medium" style={{ color: tone.fg }}>
                        {speakerName(segment.speaker, names)}
                      </span>
                      {" - "}
                      {segmentText}
                    </p>
                  ) : (
                    <p className="text-sm leading-6 whitespace-pre-wrap">{segmentText}</p>
                  )
                ) : customName ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium" style={{ color: tone.fg }}>
                      {speakerName(segment.speaker, names)} -
                    </p>
                    <Textarea
                      value={segmentText}
                      aria-label={`Replika ${index + 1}`}
                      onChange={(event) => updateSegmentText(index, event.target.value)}
                      onBlur={(event) => {
                        const nextSegments = draftSegments.map((segment, i) =>
                          i === index ? { ...segment, text: event.target.value } : segment
                        );
                        setDraftSegments(nextSegments);
                        flushSegmentDrafts(nextSegments);
                      }}
                      className="min-h-16 leading-6"
                    />
                  </div>
                ) : (
                  <Textarea
                    value={segmentText}
                    aria-label={`Replika ${index + 1}`}
                    onChange={(event) => updateSegmentText(index, event.target.value)}
                    onBlur={(event) => {
                      const nextSegments = draftSegments.map((segment, i) =>
                        i === index ? { ...segment, text: event.target.value } : segment
                      );
                      setDraftSegments(nextSegments);
                      flushSegmentDrafts(nextSegments);
                    }}
                    className="min-h-16 leading-6"
                  />
                )}
              </article>
            );
          })}
        </TabsContent>
      </Tabs>
    </section>
  );
}
