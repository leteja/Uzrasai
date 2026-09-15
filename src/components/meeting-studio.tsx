"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  FileAudio,
  Loader2,
  Lock,
  LockOpen,
  Mail,
  Mic,
  Minus,
  Plus,
  Sparkles,
  Square,
  Trash2,
  Users,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ProtocolDocument } from "@/components/protocol-document";
import { LiveTranscript } from "@/components/live-transcript";
import { SetupGuide } from "@/components/setup-guide";
import { Waveform } from "@/components/waveform";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { useLiveCaptions } from "@/hooks/use-live-captions";
import {
  MAX_RECORDING_MS,
  type MeetingListItem,
  type ProviderStatus,
  type SavedMeeting,
  formatClock,
  toMarkdown,
} from "@/lib/meeting";
import { cn } from "@/lib/utils";

const PROCESS_STEPS = [
  "Siunčiamas įrašas",
  "Skiriami balsai",
  "Rašomas sutrumpinimas",
  "Saugomas protokolas",
];

const PARTICIPANTS_KEY = "uzrasai-participants";
const EMAIL_KEY = "uzrasai-email";
const COUNT_KEY = "uzrasai-expected-count";
const LOCK_KEY = "uzrasai-lock-protocol";

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
  const [expectedCount, setExpectedCount] = useState(() => {
    if (typeof window === "undefined") return 6;
    const stored = Number(localStorage.getItem(COUNT_KEY));
    return Number.isFinite(stored) && stored >= 1 ? Math.min(20, stored) : 6;
  });
  const [participants, setParticipants] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem(PARTICIPANTS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });
  const [lockBeforeRecord, setLockBeforeRecord] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(LOCK_KEY) === "true";
  });
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailState, setEmailState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [emailError, setEmailError] = useState<string | null>(null);
  const autoStopped = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const stopNowRef = useRef<(() => Promise<void>) | null>(null);
  const liveEndRef = useRef<HTMLDivElement | null>(null);

  const busy = processing || recorder.isRecording || recorder.state === "requesting" || recorder.state === "stopping";

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
        })
      );
    void refreshArchive();
  }, []);

  useEffect(() => {
    localStorage.setItem(PARTICIPANTS_KEY, JSON.stringify(participants));
  }, [participants]);

  useEffect(() => {
    localStorage.setItem(COUNT_KEY, String(expectedCount));
  }, [expectedCount]);

  useEffect(() => {
    localStorage.setItem(LOCK_KEY, String(lockBeforeRecord));
  }, [lockBeforeRecord]);

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

  useEffect(() => {
    if (!recorder.isRecording) return;
    liveEndRef.current?.scrollIntoView({ block: "end" });
  }, [captions.utterances, captions.interim, recorder.isRecording]);

  async function refreshArchive() {
    const response = await fetch("/api/meetings");
    if (response.ok) setArchive((await response.json()) as MeetingListItem[]);
  }

  const cleanParticipants = participants.map((name) => name.trim()).filter(Boolean);

  function persistMeeting(next: SavedMeeting) {
    if (saved?.locked) return;
    setSaved(next);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void fetch("/api/meetings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: next.id,
          speakerNames: next.speakerNames,
          participants: next.participants,
          result: next.result,
          locked: next.locked,
        }),
      }).then(() => refreshArchive());
    }, 500);
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
      form.append("participants", JSON.stringify(cleanParticipants));
      form.append("expectedCount", String(expectedCount));
      form.append("locked", String(lockBeforeRecord));
      if (liveCaption) form.append("liveCaption", liveCaption);

      const response = await fetch("/api/process", { method: "POST", body: form });
      const payload = (await response.json()) as SavedMeeting & { error?: string; code?: string };
      if (!response.ok) {
        if (payload.code === "NO_PROVIDER") {
          await loadDemo();
          setError("Įrašymas serveryje dar neįjungtas. Savininkas turi įrašyti vieną Gemini raktą.");
          return;
        }
        throw new Error(payload.error || "Nepavyko apdoroti įrašo.");
      }
      setSaved(payload);
      await refreshArchive();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nepavyko apdoroti įrašo.");
    } finally {
      setProcessing(false);
    }
  }

  async function loadDemo() {
    const response = await fetch("/api/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ demo: true }),
    });
    const payload = (await response.json()) as SavedMeeting;
    setSaved(payload);
    setParticipants(["Alanas", "Rūta", "Tomas", "Justė"]);
    await refreshArchive();
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
    captions.start(expectedCount);
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

  async function copyRecord() {
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
      setEmailState("error");
      setEmailError(err instanceof Error ? err.message : "Nepavyko išsiųsti.");
    }
  }

  function lockSaved() {
    if (!saved || saved.locked) return;
    persistMeeting({
      ...saved,
      locked: true,
      lockedAt: new Date().toISOString(),
      markdown: toMarkdown(saved.result, saved.speakerNames, saved.participants, saved.expectedCount, true),
    });
  }

  const displayError = error || recorder.error;
  const readyLabel = useMemo(() => {
    if (!status) return "Kraunama";
    if (status.ready) return "Paruošta";
    return "Reikia rakto serveryje";
  }, [status]);

  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="studio-grid pointer-events-none absolute inset-0" />
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#10141c]/80 backdrop-blur-md">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-sky-300/40 to-transparent" />
        <div className="mx-auto flex min-h-16 max-w-[1600px] items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <h1 className="font-wordmark text-[1.65rem] leading-none font-semibold tracking-[0.42em] text-white uppercase sm:text-[1.9rem]">
              Užrašai
            </h1>
            <p className="mt-1 hidden text-[10px] tracking-[0.28em] text-white/40 uppercase sm:block">Susitikimų protokolas</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-white/55">
            <p className="flex items-center gap-1.5 text-sm text-white/80">
              <Users className="size-3.5 text-sky-300/80" />
              <span className="font-medium tabular-nums text-white">{expectedCount}</span>
              <span className="hidden sm:inline">{peopleWord(expectedCount)} kambaryje</span>
            </p>
            <span className="hidden h-4 w-px bg-gradient-to-b from-transparent via-white/30 to-transparent sm:block" />
            <span className="hidden items-center gap-1.5 sm:inline-flex">
              {lockBeforeRecord ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
              {lockBeforeRecord ? "Po įrašo užrakinti" : "Po įrašo taisyti"}
            </span>
            <span className="hidden md:inline">{readyLabel}</span>
            <span className={cn("font-mono tabular-nums text-sm text-white", recorder.isRecording && "text-red-300")}>
              {formatClock(recorder.elapsedMs)}
            </span>
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto grid w-full max-w-[1600px] flex-1 lg:grid-cols-[240px_minmax(0,1fr)_260px]">
        <aside className="order-2 space-y-6 border-white/10 px-4 py-6 lg:order-1 lg:border-r lg:bg-gradient-to-b lg:from-white/5 lg:to-transparent">
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-medium">Kambarys</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Skaičius viršuje. Tylintys gali neprabilti.
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Mažiau žmonių"
                disabled={busy || expectedCount <= 1}
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
                disabled={busy}
                className="w-16 text-center"
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
                disabled={busy || expectedCount >= 20}
                onClick={() => setExpectedCount((count) => Math.min(20, count + 1))}
              >
                <Plus />
              </Button>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-medium">Vardai</h2>
            <p className="text-xs text-muted-foreground">Nebūtina ir ne visiems.</p>
            {participants.map((name, index) => (
              <div key={index} className="flex gap-1.5">
                <Input
                  value={name}
                  disabled={busy}
                  placeholder={`Dalyvis ${index + 1}`}
                  onChange={(event) =>
                    setParticipants((current) => current.map((item, i) => (i === index ? event.target.value : item)))
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Pašalinti dalyvį"
                  disabled={busy}
                  onClick={() => setParticipants((current) => current.filter((_, i) => i !== index))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            {participants.length < 8 ? (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => setParticipants((current) => [...current, ""])}>
                <Plus />
                Pridėti
              </Button>
            ) : null}
          </section>

          <section className="space-y-2 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="lock-before" className="text-sm font-medium">
                Užrakinti po įrašo
              </Label>
              <Switch
                id="lock-before"
                checked={lockBeforeRecord}
                disabled={busy}
                onCheckedChange={setLockBeforeRecord}
              />
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Jei įjungta prieš Start, po Stop protokolo taisyti nebebus galima — kad neįsimaišytų netiksli informacija.
            </p>
          </section>

          <section className="space-y-2 border-t border-border pt-4">
            <h2 className="text-sm font-medium">Kita</h2>
            <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">
              <FileAudio className="size-4" />
              Įkelti garso failą
              <input
                type="file"
                accept="audio/*,.webm,.mp3,.wav,.m4a,.ogg"
                className="sr-only"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onUpload(file);
                  event.target.value = "";
                }}
              />
            </label>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void loadDemo()}
              disabled={busy}
            >
              <Sparkles className="size-4" />
              Pavyzdinis susitikimas
            </Button>
          </section>
        </aside>

        <main className="order-1 flex min-w-0 flex-col px-4 py-6 lg:order-2">
          <SetupGuide status={status} />

          {displayError ? (
            <Alert variant="destructive" className="mb-5">
              <AlertCircle />
              <AlertTitle>Nepavyko</AlertTitle>
              <AlertDescription>{displayError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="mb-2 flex flex-col items-center gap-5 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => void onToggleRecord()}
              disabled={processing || recorder.state === "requesting" || recorder.state === "stopping"}
              className={cn(
                "relative flex size-[4.75rem] shrink-0 items-center justify-center rounded-full transition disabled:opacity-50",
                recorder.isRecording
                  ? "bg-gradient-to-b from-red-400 to-red-700 text-white shadow-[0_0_40px_-8px_oklch(0.65_0.2_25)]"
                  : "bg-gradient-to-b from-white to-white/70 text-zinc-900 shadow-[0_0_36px_-10px_oklch(0.85_0.04_250)]"
              )}
              aria-label={recorder.isRecording ? "Stabdyti įrašą" : "Pradėti įrašą"}
            >
              <span className="pointer-events-none absolute inset-[-6px] rounded-full border border-white/15" />
              {recorder.state === "requesting" || recorder.state === "stopping" || processing ? (
                <Loader2 className="size-7 animate-spin" />
              ) : recorder.isRecording ? (
                <Square className="size-6 fill-current" />
              ) : (
                <Mic className="size-7" />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center justify-between gap-2 text-xs tracking-[0.18em] text-white/45 uppercase">
                <span className={cn("inline-flex items-center gap-2", recorder.isRecording && "text-red-300")}>
                  <span className={cn("size-1.5 rounded-full bg-white/30", recorder.isRecording && "animate-pulse bg-red-400")} />
                  {recorder.isRecording ? "Įrašoma gyvai" : processing ? PROCESS_STEPS[processStep] : "Start"}
                </span>
                <span className="font-mono tracking-normal text-white/80">{formatClock(recorder.elapsedMs)}</span>
              </div>
              <Waveform stream={recorder.stream} active={recorder.isRecording} />
            </div>
          </div>

          <div className="hairline my-2" />

          {recorder.isRecording || captions.utterances.length > 0 || captions.interim ? (
            <LiveTranscript
              utterances={captions.utterances}
              interim={captions.interim}
              interimSpeaker={captions.interimSpeaker}
              recording={recorder.isRecording}
              supported={captions.supported}
              endRef={liveEndRef}
            />
          ) : saved ? null : (
            <p className="py-10 font-mono text-sm tracking-wide text-white/30">
              SPEAKER 1
              <span className="ml-4 font-sans tracking-normal text-white/40">Paspaudę Start čia matysite, kas ką sako.</span>
            </p>
          )}

          {saved ? (
            <div className="mt-4">
              <div className="hairline mb-6" />
              <ProtocolDocument
                saved={saved}
                nameOptions={cleanParticipants}
                copied={copied}
                onUpdate={persistMeeting}
                onLock={lockSaved}
                onCopy={copyRecord}
              />
            </div>
          ) : null}
        </main>

        <aside className="order-3 space-y-6 border-white/10 px-4 py-6 lg:border-l lg:bg-gradient-to-b lg:from-white/5 lg:to-transparent">
          {saved ? (
            <section className="space-y-2">
              <h2 className="text-sm font-medium">Eksportas</h2>
              <Button className="w-full" onClick={() => void copyRecord()}>
                {copied ? <Check /> : <Copy />}
                Kopijuoti viską
              </Button>
              <Button variant="outline" className="w-full" onClick={downloadMarkdown}>
                <Download />
                Parsisiųsti .md
              </Button>
              <div className="space-y-1.5 pt-2">
                <Label htmlFor="email-to">El. paštas</Label>
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
                <Button className="w-full" variant="secondary" onClick={() => void sendEmail()} disabled={emailState === "sending"}>
                  {emailState === "sending" ? <Loader2 className="animate-spin" /> : <Mail />}
                  {emailState === "sent" ? "Išsiųsta" : "Siųsti"}
                </Button>
                {emailError ? <p className="text-xs text-destructive">{emailError}</p> : null}
              </div>
            </section>
          ) : null}

          <section className="space-y-2">
            <h2 className="text-sm font-medium">Archyvas</h2>
            {archive.length === 0 ? (
              <p className="text-xs text-muted-foreground">Dar nėra išsaugotų susitikimų.</p>
            ) : (
              archive.map((item) => (
                <div key={item.id} className="flex items-start gap-1 rounded-md border border-border/70 px-2 py-1.5">
                  <button type="button" className="min-w-0 flex-1 text-left text-sm hover:underline" onClick={() => void openArchive(item.id)}>
                    <span className="flex items-center gap-1 truncate font-medium">
                      {item.locked ? <Lock className="size-3 shrink-0 text-muted-foreground" /> : null}
                      {item.title}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString("lt-LT")} · {formatClock(item.durationMs)}
                    </span>
                  </button>
                  <Button variant="ghost" size="icon-xs" onClick={() => void removeArchive(item.id)} aria-label="Ištrinti">
                    <Trash2 />
                  </Button>
                </div>
              ))
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
