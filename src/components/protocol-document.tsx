"use client";

import { useState } from "react";
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
  listSpeakers,
  manualEditNotice,
  normalizeMeetingTitle,
  speakerName,
  speakerTone,
  toMarkdown,
  toSummaryCopyText,
  toTranscriptCopyText,
  uniqueSpeakerIds,
  withSpeakerCount,
} from "@/lib/meeting";

function speakerChoices(saved: SavedMeeting): SpeakerId[] {
  const present = uniqueSpeakerIds(saved.result.segments).length;
  return listSpeakers(Math.min(MAX_SPEAKERS, Math.max(present, 2)));
}

export function ProtocolDocument({
  saved,
  onUpdate,
  onLock,
  onUnlock,
}: {
  saved: SavedMeeting;
  onUpdate: (next: SavedMeeting, options?: { nameSync?: boolean }) => void;
  onLock: () => void;
  onUnlock: () => void;
}) {
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const locked = saved.locked;
  const names = saved.speakerNames;
  const speakers = uniqueSpeakerIds(saved.result.segments);
  const choices = speakerChoices(saved);
  const result = saved.result;
  const editNotice = manualEditNotice(saved.manuallyEdited, saved.editedAt);

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

  function patchSegment(index: number, patch: { text?: string; speaker?: SpeakerId }) {
    if (locked) return;
    const segments = result.segments.map((segment, i) => (i === index ? { ...segment, ...patch } : segment));
    commit(
      markManualEdit({
        ...saved,
        result: withSpeakerCount({ ...result, segments }),
      })
    );
  }

  function patchName(speaker: SpeakerId, name: string) {
    const nextNames = { ...names, [speaker]: name };
    commit(
      {
        ...saved,
        speakerNames: nextNames,
        result: {
          ...result,
          summary: applySpeakerNamesToSummary(result.summary, nextNames, names),
        },
      },
      { nameSync: true }
    );
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
            <Button variant="outline" onClick={onLock}>
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
                value={result.summary.narrative}
                onChange={(event) => patchSummary({ narrative: event.target.value })}
                className="min-h-40 leading-7"
              />
            )}
          </div>
        </TabsContent>
        <TabsContent value="transcript" className="space-y-3 pt-4">
          {result.segments.map((segment, index) => {
            const tone = speakerTone(segment.speaker);
            const customName = hasCustomSpeakerName(segment.speaker, names);
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
                          onChange={(event) => patchSegment(index, { speaker: event.target.value as SpeakerId })}
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
                      {segment.text}
                    </p>
                  ) : (
                    <p className="text-sm leading-6 whitespace-pre-wrap">{segment.text}</p>
                  )
                ) : customName ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium" style={{ color: tone.fg }}>
                      {speakerName(segment.speaker, names)} -
                    </p>
                    <Textarea
                      value={segment.text}
                      aria-label={`Replika ${index + 1}`}
                      onChange={(event) => patchSegment(index, { text: event.target.value })}
                      className="min-h-16 leading-6"
                    />
                  </div>
                ) : (
                  <Textarea
                    value={segment.text}
                    aria-label={`Replika ${index + 1}`}
                    onChange={(event) => patchSegment(index, { text: event.target.value })}
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
