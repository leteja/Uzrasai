"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  FileAudio,
  FileText,
  Loader2,
  Mail,
  Mic,
  Minus,
  Plus,
  RotateCcw,
  Square,
  Users,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Waveform } from "@/components/waveform";
import { SetupGuide } from "@/components/setup-guide";
import { ProtocolDocument } from "@/components/protocol-document";
import {
  MeetingArchiveSidebar,
  filterMeetings,
} from "@/components/meeting-archive-sidebar";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { useLiveCaptions } from "@/hooks/use-live-captions";
import {
  MAX_RECORDING_MS,
  type MeetingListItem,
  type ProviderStatus,
  type SavedMeeting,
  formatClock,
  formatSpeakerCountLabel,
} from "@/lib/meeting";
import { cn } from "@/lib/utils";

type StudioStep = "setup" | "record" | "result";

const STUDIO_STEPS: { id: StudioStep; label: string }[] = [
  { id: "setup", label: "Pasirinkimai" },
  { id: "record", label: "Įrašymas" },
  { id: "result", label: "Užrašai" },
];

const PROCESS_STEPS = [
  "Siunčiamas įrašas",
  "Skiriami balsai",
  "Rašomas aprašymas",
  "Saugoma",
];

const EMAIL_KEY = "uzrasai-email";

const SUMMARY_PRESETS = [
  { label: "Trumpas", text: "Trumpas aprašymas, 1–2 pastraipos, tik esmė." },
  { label: "Detalus", text: "Detalus aprašymas su visais faktais, skaičiais ir datomis." },
  { label: "Punktais", text: "Rašyk punktais, ne pastraipomis." },
] as const;

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
  const [step, setStep] = useState<StudioStep>("setup");
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processStep, setProcessStep] = useState(0);
  const [saved, setSaved] = useState<SavedMeeting | null>(null);
  const [archive, setArchive] = useState<MeetingListItem[]>([]);
  const [expectedCount, setExpectedCount] = useState<number | null>(null);
  const [summaryInstructions, setSummaryInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [emailState, setEmailState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveQuery, setArchiveQuery] = useState("");
  const autoStopped = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const saveGeneration = useRef(0);
  const stopNowRef = useRef<(() => Promise<void>) | null>(null);

  const result = saved?.result ?? null;

  useEffect(() => {
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
          storage: "file",
        })
      );
    void refreshArchive();
  }, []);

  useEffect(() => {
    if (emailTo) localStorage.setItem(EMAIL_KEY, emailTo);
  }, [emailTo]);

  useEffect(() => {
    if (!processing) return;
    const id = window.setInterval(() => {
      setProcessStep((s) => (s + 1) % PROCESS_STEPS.length);
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

  function cancelPendingSave() {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
  }

  function persistMeeting(next: SavedMeeting, options?: { nameSync?: boolean }) {
    setSaved(next);
    cancelPendingSave();
    const id = next.id;
    const nameSync = options?.nameSync === true;
    const generation = ++saveGeneration.current;
    saveTimer.current = window.setTimeout(async () => {
      if (generation !== saveGeneration.current) return;

      const body: Record<string, unknown> = { id };
      if (nameSync && next.locked) {
        body.speakerNames = next.speakerNames;
        body.nameSync = true;
      } else {
        body.speakerNames = next.speakerNames;
        body.result = next.result;
        body.manuallyEdited = next.manuallyEdited;
        body.editedAt = next.editedAt;
      }

      const response = await fetch("/api/meetings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (generation !== saveGeneration.current) return;
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error || "Nepavyko išsaugoti pakeitimų.");
        return;
      }

      if (nameSync && next.locked) {
        setSaved((await response.json()) as SavedMeeting);
      }
      await refreshArchive();
    }, 500);
  }

  async function unlockMeeting() {
    if (!saved || !saved.locked) return;
    cancelPendingSave();
    setError(null);
    const response = await fetch("/api/meetings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: saved.id, locked: false }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error || "Nepavyko atrakinti protokolo.");
      return;
    }
    setSaved((current) => (current ? { ...current, locked: false, lockedAt: undefined } : current));
  }

  async function lockMeeting(snapshot?: SavedMeeting) {
    const current = snapshot ?? saved;
    if (!current || current.locked) return;
    cancelPendingSave();
    setError(null);
    if (snapshot) setSaved(snapshot);
    const response = await fetch("/api/meetings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: current.id,
        locked: true,
        speakerNames: current.speakerNames,
        result: current.result,
        manuallyEdited: current.manuallyEdited,
        editedAt: current.editedAt,
      }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error || "Nepavyko užrakinti protokolo.");
      return;
    }
    const payload = (await response.json()) as SavedMeeting;
    setSaved((current) =>
      current ? { ...current, locked: true, lockedAt: payload.lockedAt ?? new Date().toISOString() } : payload
    );
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
      if (summaryInstructions.trim()) form.append("summaryInstructions", summaryInstructions.trim());
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
      setStep("result");
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
    setStep("record");
    await processAudio(file, file.type || "audio/mpeg", 0);
  }

  async function openArchive(id: string) {
    const response = await fetch(`/api/meetings/${id}`);
    if (!response.ok) return;
    const meeting = (await response.json()) as SavedMeeting;
    setSaved(meeting);
    setSummaryInstructions(meeting.summaryInstructions ?? "");
    setExpectedCount(meeting.expectedCount ?? null);
    setError(null);
    setStep("result");
  }

  async function removeArchive(id: string) {
    await fetch(`/api/meetings?id=${id}`, { method: "DELETE" });
    if (saved?.id === id) {
      setSaved(null);
      setStep("setup");
    }
    await refreshArchive();
  }

  function startNewMeeting() {
    cancelPendingSave();
    setSaved(null);
    setError(null);
    setEmailState("idle");
    setEmailError(null);
    captions.reset();
    autoStopped.current = false;
    setStep("setup");
  }

  function goToSetupFromRecord() {
    if (recorder.isRecording || processing) return;
    setError(null);
    setStep("setup");
  }

  const stepIndex = STUDIO_STEPS.findIndex((item) => item.id === step);

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
  const filteredArchive = useMemo(() => filterMeetings(archive, archiveQuery), [archive, archiveQuery]);
  const archiveEmptyMessage = archiveQuery.trim()
    ? "Pagal paiešką nieko nerasta."
    : "Dar nėra išsaugotų susitikimų.";

  const recordStatus = recorder.isRecording ? "Įrašoma" : processing ? "Apdorojama" : "Pasiruošta";
  const recordAction = recorder.isRecording ? "Stabdyti" : "Pradėti";

  return (
    <div className="flex min-h-dvh w-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="px-6 pt-8 pb-2">
          <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
            <div className="space-y-2">
              <h1 className="font-heading text-5xl leading-none tracking-tight sm:text-6xl">Užrašai</h1>
              <p className="text-sm text-muted-foreground">Įrašykite susitikimą ir gaukite aprašymą.</p>
            </div>
            {!status?.ready ? (
              <Badge variant="outline" className="h-auto max-w-[11rem] shrink-0 px-2.5 py-1.5 text-left text-[11px] leading-4 font-normal whitespace-normal sm:text-left">
                {readyLabel}
              </Badge>
            ) : null}
          </div>
        </header>

        <main className="flex-1 px-6 pb-8">
          <div className="mx-auto w-full max-w-2xl space-y-5">
            <nav aria-label="Susitikimo žingsniai" className="flex items-center justify-center gap-1 sm:gap-2">
              {STUDIO_STEPS.map((item, index) => {
                const isCurrent = item.id === step;
                const isComplete = index < stepIndex;
                const canOpenSetupFromResult = step === "result" && item.id === "setup";

                return (
                  <div key={item.id} className="flex items-center gap-1 sm:gap-2">
                    {index > 0 ? <span className="text-muted-foreground/40">·</span> : null}
                    {canOpenSetupFromResult ? (
                      <button
                        type="button"
                        onClick={startNewMeeting}
                        className="rounded-full px-2.5 py-1 text-xs font-medium text-primary transition hover:bg-primary/10 sm:text-sm"
                      >
                        {item.label}
                      </button>
                    ) : (
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs sm:text-sm",
                          isCurrent && "bg-primary/10 font-medium text-primary",
                          isComplete && "text-muted-foreground",
                          !isCurrent && !isComplete && "text-muted-foreground/50"
                        )}
                      >
                        {item.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </nav>

            {step === "setup" ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Susitikimo nustatymai</CardTitle>
                  <CardDescription>Pasirinkite dalyvių skaičių ir aprašymo formą.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Users className="size-4 text-muted-foreground" />
                      Dalyvių skaičius
                    </div>
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
                  </div>

                  <div className="space-y-3 border-t border-border/60 pt-6">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <FileText className="size-4 text-muted-foreground" />
                      Aprašymo instrukcijos
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {SUMMARY_PRESETS.map((preset) => (
                        <Button
                          key={preset.label}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSummaryInstructions(preset.text)}
                        >
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                    <Textarea
                      id="summary-instructions"
                      value={summaryInstructions}
                      onChange={(event) => setSummaryInstructions(event.target.value)}
                      placeholder="Pvz.: Trumpas aprašymas punktais. Pridėkite biudžeto skaičius."
                      className="min-h-28 leading-6"
                    />
                    <p className="text-xs text-muted-foreground">
                      {summaryInstructions.trim()
                        ? "Instrukcijos bus pritaikytos generuojant aprašymą."
                        : "Palikite tuščią — bus naudojamas numatytasis aprašymas."}
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 border-t border-border/60 pt-6 sm:flex-row sm:items-center sm:justify-between">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground">
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
                    <Button size="lg" className="gap-2" onClick={() => setStep("record")}>
                      Tęsti įrašymą
                      <ArrowRight className="size-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {step === "record" ? (
              <Card>
                <CardContent className="space-y-5 pt-6">
                  {!recorder.isRecording && !processing ? (
                    <Button variant="ghost" size="sm" className="-ml-2 gap-1 text-muted-foreground" onClick={goToSetupFromRecord}>
                      Keisti pasirinkimus
                    </Button>
                  ) : null}

                  <div className="rounded-2xl bg-muted/60 px-4 py-4">
                    <Waveform stream={recorder.stream} active={recorder.isRecording} />
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className={cn("inline-flex items-center gap-2 text-muted-foreground", recorder.isRecording && "text-red-600")}>
                        <span
                          className={cn(
                            "size-2 rounded-full bg-muted-foreground/30",
                            recorder.isRecording && "animate-pulse bg-red-500"
                          )}
                        />
                        {recordStatus}
                      </span>
                      <span className="font-mono text-lg tabular-nums">{formatClock(recorder.elapsedMs)}</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={() => void onToggleRecord()}
                      disabled={processing || recorder.state === "requesting" || recorder.state === "stopping"}
                      className={cn(
                        "flex size-24 shrink-0 items-center justify-center rounded-full text-white shadow-lg transition disabled:opacity-50",
                        recorder.isRecording ? "bg-red-500 hover:bg-red-400" : "bg-primary hover:bg-primary/90"
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
                    <div>
                      <p className="text-xl font-medium">{recordAction}</p>
                      <p className="text-sm text-muted-foreground">
                        {recorder.isRecording ? "Stabdyti ir gauti užrašus" : "Iki 70 min."}
                      </p>
                    </div>
                  </div>

                  {recorder.isRecording && captions.liveText ? (
                    <p className="rounded-xl border border-border/60 bg-muted/40 p-3 text-sm leading-6">
                      <span className="mb-1 block text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                        Tiesioginė antraštė
                      </span>
                      {captions.liveText}
                    </p>
                  ) : null}

                  {processing ? (
                    <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      {PROCESS_STEPS[processStep]}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            {displayError ? (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertTitle>Nepavyko</AlertTitle>
                <AlertDescription>{displayError}</AlertDescription>
              </Alert>
            ) : null}

            {step === "result" && result && saved ? (
              <Card>
                <CardHeader className="gap-4 border-b border-border/60 pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={saved.locked ? "secondary" : "outline"}>
                        {saved.locked ? "Užrakinta" : "Redaguojama"}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {formatClock(result.durationMs)} · {formatSpeakerCountLabel(result.speakerCount, saved.expectedCount)}
                      </span>
                    </div>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={startNewMeeting}>
                      <RotateCcw className="size-3.5" />
                      Įrašyti per naujo
                    </Button>
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
                <CardContent className="space-y-6 pt-5">
                  <ProtocolDocument
                    saved={saved}
                    onUpdate={persistMeeting}
                    onLock={(snapshot) => void lockMeeting(snapshot)}
                    onUnlock={() => void unlockMeeting()}
                  />
                  <div className="flex flex-col items-stretch gap-3 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">
                      Norite kito susitikimo? Pradėkite nuo dalyvių skaičiaus ir aprašymo formos.
                    </p>
                    <Button size="lg" className="gap-2 sm:shrink-0" onClick={startNewMeeting}>
                      <RotateCcw className="size-4" />
                      Įrašyti per naujo
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {!status?.ready && step === "setup" ? (
              <details className="rounded-xl border bg-card">
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:content-none [&::-webkit-details-marker]:hidden">
                  Savininko nustatymas (vieną kartą)
                </summary>
                <div className="border-t px-1 pb-1">
                  <SetupGuide status={status} />
                </div>
              </details>
            ) : null}
          </div>
        </main>
      </div>

      <MeetingArchiveSidebar
        className="sticky top-0 flex h-dvh shrink-0"
        items={filteredArchive}
        totalCount={archive.length}
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        query={archiveQuery}
        onQueryChange={setArchiveQuery}
        activeId={saved?.id}
        onSelect={(id) => void openArchive(id)}
        onRemove={(id) => void removeArchive(id)}
        emptyMessage={archiveEmptyMessage}
      />
    </div>
  );
}
