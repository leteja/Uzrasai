"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  Download,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Waveform } from "@/components/waveform";
import { SetupGuide } from "@/components/setup-guide";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { useLiveCaptions } from "@/hooks/use-live-captions";
import {
  MAX_RECORDING_MS,
  type MeetingListItem,
  type ProviderStatus,
  type SavedMeeting,
  formatClock,
  formatTimestamp,
  speakerName,
  speakerTone,
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
  const [expectedCount, setExpectedCount] = useState(6);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailState, setEmailState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [emailError, setEmailError] = useState<string | null>(null);
  const autoStopped = useRef(false);
  const stopNowRef = useRef<(() => Promise<void>) | null>(null);

  const result = saved?.result ?? null;
  const names = saved?.speakerNames ?? {};

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
    localStorage.setItem(COUNT_KEY, String(expectedCount));
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
      form.append("expectedCount", String(expectedCount));
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

  async function copyMarkdown() {
    if (!saved) return;
    await navigator.clipboard.writeText(saved.markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function downloadMarkdown() {
    if (!saved) return;
    const blob = new Blob([saved.markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${saved.result.summary.title.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60)}.md`;
    link.click();
    URL.revokeObjectURL(url);
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
                    disabled={expectedCount <= 1}
                    onClick={() => setExpectedCount((count) => Math.max(1, count - 1))}
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
                    value={expectedCount}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (!Number.isFinite(value)) return;
                      setExpectedCount(Math.min(20, Math.max(1, Math.round(value))));
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Daugiau žmonių"
                    disabled={expectedCount >= 20}
                    onClick={() => setExpectedCount((count) => Math.min(20, count + 1))}
                  >
                    <Plus />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {expectedCount} {peopleWord(expectedCount)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[linear-gradient(180deg,oklch(0.23_0.03_250),oklch(0.18_0.02_250))] text-white ring-white/10">
            <CardHeader>
              <CardTitle className="text-white">Įrašas kambaryje</CardTitle>
              <CardDescription className="text-white/65">Start → kalbėkite → Stop.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-2xl bg-black/25 px-3 py-4 ring-1 ring-white/10">
                <Waveform stream={recorder.stream} active={recorder.isRecording} />
                <div className="mt-3 flex items-center justify-between text-sm text-white/70">
                  <span className={cn("inline-flex items-center gap-2", recorder.isRecording && "text-red-300")}>
                    <span className={cn("size-2 rounded-full bg-white/30", recorder.isRecording && "animate-pulse bg-red-400")} />
                    {recorder.isRecording ? "Įrašoma" : processing ? "Apdorojama kelias minutes" : "Laukiama"}
                  </span>
                  <span className="font-mono tabular-nums text-lg text-white">{formatClock(recorder.elapsedMs)}</span>
                </div>
              </div>

              <div className="flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={() => void onToggleRecord()}
                  disabled={processing || recorder.state === "requesting" || recorder.state === "stopping"}
                  className={cn(
                    "flex size-24 items-center justify-center rounded-full text-white shadow-[0_16px_40px_-18px_rgba(0,0,0,0.7)] transition disabled:opacity-50",
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
                  <p className="text-sm font-medium text-white">{recorder.isRecording ? "Stop" : "Start"}</p>
                  <p className="text-xs text-white/55">
                    {recorder.isRecording ? "Stabdyti ir apdoroti" : "Iki 70 min."}
                  </p>
                </div>
              </div>

              {recorder.isRecording && captions.liveText ? (
                <p className="rounded-xl bg-white/8 p-3 text-sm leading-6 text-white/80">
                  <span className="mr-2 text-[11px] tracking-wide text-white/45 uppercase">Gyvos antraštės</span>
                  {captions.liveText}
                </p>
              ) : null}

              {processing ? (
                <div className="flex items-center gap-2 rounded-xl bg-white/8 px-3 py-2 text-sm text-white/80">
                  <Loader2 className="size-4 animate-spin" />
                  {PROCESS_STEPS[processStep]}
                </div>
              ) : null}

              <Separator className="bg-white/10" />

              <div className="flex flex-col gap-3 sm:flex-row">
                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15">
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
                    {saved.expectedCount ? ` iš ${saved.expectedCount}` : ""}
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

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => void copyMarkdown()}>
                    {copied ? <Check /> : <Copy />}
                    Kopijuoti Markdown
                  </Button>
                  <Button size="sm" onClick={downloadMarkdown}>
                    <Download />
                    Parsisiųsti .md
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="summary">
                  <TabsList>
                    <TabsTrigger value="summary">Aprašymas</TabsTrigger>
                    <TabsTrigger value="transcript">Visas pokalbis</TabsTrigger>
                  </TabsList>
                  <TabsContent value="summary" className="space-y-4 pt-4">
                    <div className="font-heading text-base leading-8 whitespace-pre-wrap">{result.summary.narrative}</div>
                    {result.summary.decisions.length > 0 ? (
                      <div>
                        <h3 className="mb-2 text-sm font-medium">Nutarimai</h3>
                        <ul className="list-disc space-y-1 pl-5 text-sm">
                          {result.summary.decisions.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {result.summary.nextSteps.length > 0 ? (
                      <div>
                        <h3 className="mb-2 text-sm font-medium">Tolesni žingsniai</h3>
                        <ul className="list-disc space-y-1 pl-5 text-sm">
                          {result.summary.nextSteps.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </TabsContent>
                  <TabsContent value="transcript" className="space-y-3 pt-4">
                    {result.segments.map((segment, index) => {
                      const tone = speakerTone(segment.speaker);
                      return (
                        <article key={`${segment.startMs}-${index}`} className="flex gap-3">
                          <span className="mt-1 w-12 shrink-0 font-mono text-[11px] text-muted-foreground">
                            {formatTimestamp(segment.startMs)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <span
                              className="mb-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-black/5"
                              style={{ background: tone.bg, color: tone.fg }}
                            >
                              {speakerName(segment.speaker, names)}
                            </span>
                            <p className="text-sm leading-6">{segment.text}</p>
                          </div>
                        </article>
                      );
                    })}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
