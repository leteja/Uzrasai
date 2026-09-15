"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  FileAudio,
  Loader2,
  Mail,
  Mic,
  Minus,
  Plus,
  Square,
  Trash2,
  Users,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Waveform } from "@/components/waveform";
import { SetupGuide } from "@/components/setup-guide";
import { ProtocolDocument } from "@/components/protocol-document";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { useLiveCaptions } from "@/hooks/use-live-captions";
import {
  MAX_RECORDING_MS,
  type MeetingListItem,
  type ProviderStatus,
  type SavedMeeting,
  formatClock,
} from "@/lib/meeting";
import { cn } from "@/lib/utils";

const PROCESS_STEPS = [
  "Siunčiamas įrašas",
  "Skiriami balsai",
  "Rašomas aprašymas",
  "Saugoma",
];

const EMAIL_KEY = "uzrasai-email";
const COUNT_KEY = "uzrasai-expected-count";

function friendlyFetchError(message: string): string {
  if (message === "Failed to fetch" || message.includes("NetworkError") || message.includes("Load failed")) {
    return "Ryšys su serveriu nutrūko. Patikrinkite internetą ir bandykite dar kartą.";
  }
  return message;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) throw new Error("Serveris negrąžino atsakymo.");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Serveris grąžino netinkamą atsakymą.");
  }
}

function peopleWord(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod10 === 1 && mod100 !== 11) return "žmogus";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "žmonės";
  return "žmonių";
}

export function MeetingStudio() {
  const recorder = useAudioRecorder();
  const captions = useLiveCaptions();
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processStep, setProcessStep] = useState(0);
  const [saved, setSaved] = useState<SavedMeeting | null>(null);
  const [archive, setArchive] = useState<MeetingListItem[]>([]);
  const [expectedCount, setExpectedCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [emailState, setEmailState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [emailError, setEmailError] = useState<string | null>(null);
  const autoStopped = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const stopNowRef = useRef<(() => Promise<void>) | null>(null);

  const result = saved?.result ?? null;

  useEffect(() => {
    const storedCount = Number(localStorage.getItem(COUNT_KEY));
    if (Number.isFinite(storedCount) && storedCount >= 1) {
      setExpectedCount(Math.min(20, storedCount));
    }
    void fetch("/api/status")
      .then((response) => response.json())
      .then((data: ProviderStatus) => {
        setStatus(data);
        setEmailTo((current) => current || data.defaultEmail || localStorage.getItem(EMAIL_KEY) || "");
      })
      .catch(() =>
        setStatus({
          gemini: false,
          groq: false,
          resend: false,
          ready: false,
          preferred: "demo",
          defaultEmail: "",
        })
      );
    void refreshArchive();
  }, []);

  useEffect(() => {
    localStorage.setItem(COUNT_KEY, expectedCount === null ? "0" : String(expectedCount));
  }, [expectedCount]);

  useEffect(() => {
    if (emailTo) localStorage.setItem(EMAIL_KEY, emailTo);
  }, [emailTo]);

  useEffect(() => {
    if (!processing) return;
    const id = window.setInterval(() => {
      setProcessStep((step) => (step + 1) % PROCESS_STEPS.length);
    }, 1800);
    return () => window.clearInterval(id);
  }, [processing]);

  useEffect(() => {
    if (!recorder.isRecording || recorder.elapsedMs < MAX_RECORDING_MS || autoStopped.current) return;
    autoStopped.current = true;
    void stopNowRef.current?.();
  }, [recorder.elapsedMs, recorder.isRecording]);

  async function refreshArchive() {
    const response = await fetch("/api/meetings");
    if (response.ok) setArchive((await response.json()) as MeetingListItem[]);
  }

  function persistMeeting(next: SavedMeeting) {
    setSaved(next);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const id = next.id;
    saveTimer.current = window.setTimeout(() => {
      void fetch("/api/meetings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          speakerNames: next.speakerNames,
          result: next.result,
        }),
      }).then(() => refreshArchive());
    }, 500);
  }

  async function lockMeeting() {
    if (!saved || saved.locked) return;
    const response = await fetch("/api/meetings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: saved.id, locked: true }),
    });
    if (response.ok) setSaved((await response.json()) as SavedMeeting);
  }

  async function processAudio(file: Blob, mimeType: string, durationMs: number, liveCaption?: string) {
    setProcessing(true);
    setProcessStep(0);
    setError(null);
    setEmailState("idle");
    try {
      const form = new FormData();
      form.append("audio", file, "meeting.webm");
      form.append("mimeType", mimeType);
      form.append("durationMs", String(durationMs));
      form.append("participants", "[]");
      form.append("expectedCount", String(expectedCount ?? 0));
      if (liveCaption) form.append("liveCaption", liveCaption);

      const response = await fetch("/api/process", { method: "POST", body: form });
      const payload = await readJsonResponse<SavedMeeting & { error?: string; code?: string }>(response);
      if (!response.ok) {
        if (payload.code === "NO_PROVIDER") {
          setError("Įrašymas serveryje dar neįjungtas. Savininkas turi įrašyti Gemini raktą.");
          return;
        }
        throw new Error(payload.error || "Nepavyko apdoroti įrašo.");
      }
      setSaved(payload);
      await refreshArchive();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nepavyko apdoroti įrašo.";
      setError(friendlyFetchError(message));
    } finally {
      setProcessing(false);
    }
  }

  async function onToggleRecord() {
    if (recorder.isRecording) {
      const liveCaption = captions.stop();
      const recording = await recorder.stop();
      autoStopped.current = false;
      if (!recording) return;
      await processAudio(recording.blob, recording.mimeType, recording.durationMs, liveCaption);
      return;
    }
    autoStopped.current = false;
    setSaved(null);
    setError(null);
    captions.reset();
    await recorder.start();
    captions.start();
  }

  stopNowRef.current = onToggleRecord;

  async function onUpload(file: File) {
    setSaved(null);
    setError(null);
    await processAudio(file, file.type || "audio/mpeg", 0);
  }

  async function openArchive(id: string) {
    const response = await fetch(`/api/meetings/${id}`);
    if (!response.ok) return;
    setSaved((await response.json()) as SavedMeeting);
    setError(null);
  }

  async function removeArchive(id: string) {
    await fetch(`/api/meetings?id=${id}`, { method: "DELETE" });
    if (saved?.id === id) setSaved(null);
    await refreshArchive();
  }

  async function sendEmail() {
    if (!saved) return;
    setEmailState("sending");
    setEmailError(null);
    try {
      const response = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: saved.id, to: emailTo }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Nepavyko išsiųsti.");
      setEmailState("sent");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nepavyko išsiųsti.";
      setEmailState("error");
      setEmailError(friendlyFetchError(message));
    }
  }

  const readyLabel = useMemo(() => {
    if (!status) return "Kraunama…";
    if (status.ready) return "Galima įrašyti";
    return "Savininkui reikia rakto serveryje";
  }, [status]);

  const displayError = error || recorder.error;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl space-y-3">
          <p className="text-xs font-medium tracking-[0.22em] text-speaker-one uppercase">Užrašai</p>
          <h1 className="font-heading text-4xl leading-[1.05] text-balance sm:text-5xl">
            Start. Stop. Gaukite užrašus.
          </h1>
          <p className="max-w-xl text-base text-muted-foreground">
            Spauskite Start, kalbėkite, tada Stop.
          </p>
        </div>
        {status?.ready ? null : (
          <Badge variant="outline" className="h-auto max-w-xs px-3 py-2 text-left text-xs leading-5 font-normal whitespace-normal">
            {readyLabel}
          </Badge>
        )}
      </header>

      <SetupGuide status={status} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-4" />
                Dalyvių skaičius
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Mažiau žmonių"
                    disabled={expectedCount === null}
                    onClick={() =>
                      setExpectedCount((count) => (count === null || count <= 1 ? null : count - 1))
                    }
                  >
                    <Minus />
                  </Button>
                  <Input
                    id="expected-count"
                    type="number"
                    min={1}
                    max={20}
                    inputMode="numeric"
                    className="w-20 text-center"
                    placeholder="—"
                    value={expectedCount ?? ""}
                    onChange={(event) => {
                      const raw = event.target.value.trim();
                      if (!raw) {
                        setExpectedCount(null);
                        return;
                      }
                      const value = Number(raw);
                      if (!Number.isFinite(value)) return;
                      setExpectedCount(Math.min(20, Math.max(1, Math.round(value))));
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Daugiau žmonių"
                    disabled={expectedCount !== null && expectedCount >= 20}
                    onClick={() => setExpectedCount((count) => Math.min(20, (count ?? 0) + 1))}
                  >
                    <Plus />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {expectedCount === null ? "Nepateikta" : `${expectedCount} ${peopleWord(expectedCount)}`}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="ring-2 ring-speaker-two/25">
            <CardHeader>
              <CardTitle>Įrašas kambaryje</CardTitle>
              <CardDescription>Start → kalbėkite → Stop.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-2xl bg-muted/70 px-3 py-4 ring-1 ring-border">
                <Waveform stream={recorder.stream} active={recorder.isRecording} />
                <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                  <span className={cn("inline-flex items-center gap-2", recorder.isRecording && "text-red-600")}>
                    <span className={cn("size-2 rounded-full bg-muted-foreground/30", recorder.isRecording && "animate-pulse bg-red-500")} />
                    {recorder.isRecording ? "Įrašoma" : processing ? "Apdorojama kelias minutes" : "Laukiama"}
                  </span>
                  <span className="font-mono tabular-nums text-lg text-foreground">{formatClock(recorder.elapsedMs)}</span>
                </div>
              </div>

              <div className="flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={() => void onToggleRecord()}
                  disabled={processing || recorder.state === "requesting" || recorder.state === "stopping"}
                  className={cn(
                    "flex size-24 items-center justify-center rounded-full text-white shadow-md transition disabled:opacity-50",
                    recorder.isRecording ? "bg-red-500 hover:bg-red-400" : "bg-speaker-two hover:brightness-110"
                  )}
                  aria-label={recorder.isRecording ? "Stabdyti įrašą" : "Pradėti įrašą"}
                >
                  {recorder.state === "requesting" || recorder.state === "stopping" || processing ? (
                    <Loader2 className="size-8 animate-spin" />
                  ) : recorder.isRecording ? (
                    <Square className="size-8 fill-current" />
                  ) : (
                    <Mic className="size-9" />
                  )}
                </button>
                <div className="text-center">
                  <p className="text-sm font-medium">{recorder.isRecording ? "Stop" : "Start"}</p>
                  <p className="text-xs text-muted-foreground">
                    {recorder.isRecording ? "Stabdyti ir apdoroti" : "Iki 70 min."}
                  </p>
                </div>
              </div>

              {recorder.isRecording && captions.liveText ? (
                <p className="rounded-xl bg-muted/80 p-3 text-sm leading-6 text-foreground">
                  <span className="mr-2 text-[11px] tracking-wide text-muted-foreground uppercase">Gyvos antraštės</span>
                  {captions.liveText}
                </p>
              ) : null}

              {processing ? (
                <div className="flex items-center gap-2 rounded-xl bg-muted/80 px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {PROCESS_STEPS[processStep]}
                </div>
              ) : null}

              <Separator />

              <div className="flex flex-col gap-3 sm:flex-row">
                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted/60">
                  <FileAudio className="size-4" />
                  Įkelti garso failą
                  <input
                    type="file"
                    accept="audio/*,.webm,.mp3,.wav,.m4a,.ogg"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void onUpload(file);
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {displayError ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Nepavyko</AlertTitle>
              <AlertDescription>{displayError}</AlertDescription>
            </Alert>
          ) : null}

          {archive.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Išsaugoti susitikimai</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {archive.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 rounded-lg bg-muted/70 px-2 py-1.5">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left text-sm hover:underline"
                      onClick={() => void openArchive(item.id)}
                    >
                      <span className="block truncate font-medium">{item.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(item.createdAt).toLocaleString("lt-LT")} · {formatClock(item.durationMs)} · {item.speakerCount} bals.
                      </span>
                    </button>
                    <Button variant="ghost" size="icon-xs" onClick={() => void removeArchive(item.id)} aria-label="Ištrinti">
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {!result && !processing ? (
            <Card>
              <CardHeader>
                <CardTitle>Dar nėra užrašų</CardTitle>
                <CardDescription>Spauskite Start ir pradėkite kalbėti.</CardDescription>
              </CardHeader>
            </Card>
          ) : null}

          {result && saved ? (
            <Card>
              <CardHeader className="gap-4">
                <div>
                  <CardTitle className="font-heading text-2xl">{result.summary.title}</CardTitle>
                  <CardDescription>
                    {formatClock(result.durationMs)} · prabilo {result.speakerCount}
                    {saved.expectedCount > 0 ? ` iš ${saved.expectedCount}` : ""}
                  </CardDescription>
                </div>

                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <div className="space-y-1.5">
                    <Label htmlFor="email-to">Siųsti aprašymą el. paštu</Label>
                    <Input
                      id="email-to"
                      type="email"
                      placeholder="vardas@imone.lt"
                      value={emailTo}
                      onChange={(event) => {
                        setEmailTo(event.target.value);
                        setEmailState("idle");
                      }}
                    />
                  </div>
                  <Button className="self-end" onClick={() => void sendEmail()} disabled={emailState === "sending"}>
                    {emailState === "sending" ? <Loader2 className="animate-spin" /> : <Mail />}
                    {emailState === "sent" ? "Išsiųsta" : "Siųsti laišką"}
                  </Button>
                </div>
                {emailError ? <p className="text-xs text-destructive">{emailError}</p> : null}
              </CardHeader>
              <CardContent>
                <ProtocolDocument
                  saved={saved}
                  onUpdate={persistMeeting}
                  onLock={() => void lockMeeting()}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
