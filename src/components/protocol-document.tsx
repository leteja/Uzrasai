"use client";

import { Check, Copy, Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_SPEAKERS,
  type SavedMeeting,
  type SpeakerId,
  defaultSpeakerLabel,
  formatTimestamp,
  listSpeakers,
  speakerName,
  speakerTone,
  toMarkdown,
  uniqueSpeakerIds,
  withSpeakerCount,
} from "@/lib/meeting";
import { cn } from "@/lib/utils";

function speakerChoices(saved: SavedMeeting): SpeakerId[] {
  const present = uniqueSpeakerIds(saved.result.segments).length;
  return listSpeakers(Math.min(MAX_SPEAKERS, Math.max(present, saved.expectedCount || 1, 2)));
}

export function ProtocolDocument({
  saved,
  nameOptions,
  copied,
  onUpdate,
  onLock,
  onCopy,
}: {
  saved: SavedMeeting;
  nameOptions: string[];
  copied: boolean;
  onUpdate: (next: SavedMeeting) => void;
  onLock: () => void;
  onCopy: () => void;
}) {
  const locked = saved.locked;
  const names = saved.speakerNames;
  const speakers = uniqueSpeakerIds(saved.result.segments);
  const choices = speakerChoices(saved);
  const result = saved.result;

  function commit(next: SavedMeeting) {
    onUpdate({
      ...next,
      markdown: toMarkdown(
        next.result,
        next.speakerNames,
        next.participants,
        next.expectedCount,
        next.locked
      ),
    });
  }

  function patchSummary(patch: Partial<typeof result.summary>) {
    if (locked) return;
    commit({
      ...saved,
      result: {
        ...result,
        summary: { ...result.summary, ...patch },
      },
    });
  }

  function patchSegment(index: number, patch: { text?: string; speaker?: SpeakerId }) {
    if (locked) return;
    const segments = result.segments.map((segment, i) => (i === index ? { ...segment, ...patch } : segment));
    commit({
      ...saved,
      result: withSpeakerCount({ ...result, segments }),
    });
  }

  function patchName(speaker: SpeakerId, name: string) {
    if (locked) return;
    commit({
      ...saved,
      speakerNames: { ...names, [speaker]: name },
    });
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          {locked ? (
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Užrakinta</p>
          ) : (
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Taisyti</p>
          )}
          {locked ? (
            <h2 className="text-xl font-medium tracking-tight text-balance">{result.summary.title}</h2>
          ) : (
            <Input
              aria-label="Protokolo pavadinimas"
              value={result.summary.title}
              onChange={(event) => patchSummary({ title: event.target.value })}
              className="h-auto border-0 bg-transparent px-0 text-xl font-medium tracking-tight shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
          )}
          <p className="text-xs text-muted-foreground">
            Prabilo {result.speakerCount}
            {saved.expectedCount ? ` iš ${saved.expectedCount}` : ""} kambaryje
            {locked ? " · keisti negalima" : " · žodžius ir kalbėtojus galima taisyti"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void onCopy()}>
            {copied ? <Check /> : <Copy />}
            Kopijuoti
          </Button>
          {locked ? (
            <Button variant="outline" disabled>
              <Lock />
              Užrakinta
            </Button>
          ) : (
            <Button variant="outline" onClick={onLock}>
              <LockOpen />
              Užrakinti
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Vardai</p>
        <p className="text-xs text-muted-foreground">Jei ne visi paminėjo, geriausia nė vienam neduoti.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {speakers.map((speaker) => {
            return (
              <div key={speaker} className="space-y-1">
                <Label htmlFor={`name-${speaker}`} className="text-xs">
                  {defaultSpeakerLabel(speaker)}
                </Label>
                <Input
                  id={`name-${speaker}`}
                  list="protocol-names"
                  disabled={locked}
                  placeholder="Vardas"
                  value={names[speaker] ?? ""}
                  onChange={(event) => patchName(speaker, event.target.value)}
                />
              </div>
            );
          })}
        </div>
        <datalist id="protocol-names">
          {nameOptions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </div>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Sutrumpinimas</TabsTrigger>
          <TabsTrigger value="transcript">Visas pokalbis</TabsTrigger>
        </TabsList>
        <TabsContent value="summary" className="space-y-4 pt-4">
          <div className="space-y-1.5">
            <Label htmlFor="narrative">Aprašymas</Label>
            <Textarea
              id="narrative"
              disabled={locked}
              value={result.summary.narrative}
              onChange={(event) => patchSummary({ narrative: event.target.value })}
              className="min-h-40 leading-7"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="decisions">Nutarimai — po vieną eilutėje</Label>
            <Textarea
              id="decisions"
              disabled={locked}
              value={result.summary.decisions.join("\n")}
              onChange={(event) =>
                patchSummary({
                  decisions: event.target.value.split("\n").map((line) => line.trimEnd()),
                })
              }
              className="min-h-24"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="next-steps">Tolesni žingsniai — po vieną eilutėje</Label>
            <Textarea
              id="next-steps"
              disabled={locked}
              value={result.summary.nextSteps.join("\n")}
              onChange={(event) =>
                patchSummary({
                  nextSteps: event.target.value.split("\n").map((line) => line.trimEnd()),
                })
              }
              className="min-h-24"
            />
          </div>
        </TabsContent>
        <TabsContent value="transcript" className="space-y-3 pt-4">
          {result.segments.map((segment, index) => {
            const tone = speakerTone(segment.speaker);
            return (
              <article key={`${segment.startMs}-${index}`} className="rounded-md border border-border/80 bg-muted/20 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground">{formatTimestamp(segment.startMs)}</span>
                  <label className="sr-only" htmlFor={`speaker-${index}`}>
                    Kalbėtojas
                  </label>
                  <select
                    id={`speaker-${index}`}
                    disabled={locked}
                    value={segment.speaker}
                    aria-label="Priskirti kitam kalbėtojui"
                    onChange={(event) => patchSegment(index, { speaker: event.target.value as SpeakerId })}
                    className={cn(
                      "h-7 max-w-full rounded-md border border-input bg-background px-2 text-xs",
                      locked && "opacity-70"
                    )}
                    style={{ color: tone.fg }}
                  >
                    {choices.map((id) => (
                      <option key={id} value={id}>
                        {speakerName(id, names)}
                      </option>
                    ))}
                  </select>
                </div>
                <Textarea
                  disabled={locked}
                  value={segment.text}
                  aria-label={`Replika ${index + 1}`}
                  onChange={(event) => patchSegment(index, { text: event.target.value })}
                  className="min-h-16 leading-6"
                />
              </article>
            );
          })}
        </TabsContent>
      </Tabs>
    </section>
  );
}
