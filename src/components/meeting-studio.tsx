"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeftRight,
  Check,
  Copy,
  Download,
  FileAudio,
  Loader2,
  Mic,
  Sparkles,
  Square,
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
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { useLiveCaptions } from "@/hooks/use-live-captions";
import {
  DEMO_MEETING,
  type MeetingResult,
  type ProviderStatus,
  type SpeakerId,
  SPEAKER_LABELS,
  formatClock,
  formatTimestamp,
  toMarkdown,
} from "@/lib/meeting";
import { cn } from "@/lib/utils";

const PROCESS_STEPS = [
  "Siunčiamas įrašas",
  "Skiriami balsai",
  "Rašomas pokalbio aprašymas",
];

function speakerClass(speaker: SpeakerId) {
  return speaker === "SPEAKER_1"
    ? "bg-speaker-one/12 text-speaker-one ring-speaker-one/20"
    : "bg-speaker-two/12 text-speaker-two ring-speaker-two/20";
}

export function MeetingStudio() {
  const recorder = useAudioRecorder();
  const captions = useLiveCaptions();
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processStep, setProcessStep] = useState(0);
  const [result, setResult] = useState<MeetingResult | null>(null);
  const [names, setNames] = useState<Record<SpeakerId, string>>(SPEAKER_LABELS);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"notes" | "all" | null>(null);

  useEffect(() => {
    void fetch("/api/status")
      .then((response) => response.json())
      .then((data: ProviderStatus) => setStatus(data))
      .catch(() => setStatus({ gemini: false, groq: false, ready: false, preferred: "demo" }));
  }, []);

  useEffect(() => {
    if (!processing) return;
    const id = window.setInterval(() => {
      setProcessStep((step) => (step + 1) % PROCESS_STEPS.length);
    }, 1800);
    return () => window.clearInterval(id);
  }, [processing]);

  const displayError = error || recorder.error;

  async function processAudio(file: Blob, mimeType: string, durationMs: number, liveCaption?: string) {
    setProcessing(true);
    setProcessStep(0);
    setError(null);
    try {
      const form = new FormData();
      form.append("audio", file, "meeting.webm");
      form.append("mimeType", mimeType);
      form.append("durationMs", String(durationMs));
      if (liveCaption) form.append("liveCaption", liveCaption);

      const response = await fetch("/api/process", { method: "POST", body: form });
      const payload = (await response.json()) as MeetingResult & { error?: string; code?: string };
      if (!response.ok) {
        if (payload.code === "NO_PROVIDER") {
          setResult(DEMO_MEETING);
          setError("Tikras įrašas dar neapdorotas — trūksta API rakto. Žemiau parodytas pavyzdys, o instrukcija — viršuje.");
          return;
        }
        throw new Error(payload.error || "Nepavyko apdoroti įrašo.");
      }
      setResult(payload);
      setNames(SPEAKER_LABELS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nepavyko apdoroti įrašo.");
    } finally {
      setProcessing(false);
    }
  }

  async function onToggleRecord() {
    if (recorder.isRecording) {
      const liveCaption = captions.stop();
      const recording = await recorder.stop();
      if (!recording) return;
      await processAudio(recording.blob, recording.mimeType, recording.durationMs, liveCaption);
      return;
    }
    setResult(null);
    setError(null);
    captions.reset();
    await recorder.start();
    captions.start();
  }

  async function onUpload(file: File) {
    setResult(null);
    setError(null);
    await processAudio(file, file.type || "audio/mpeg", 0);
  }

  function swapSpeakers() {
    if (!result) return;
    setResult({
      ...result,
      segments: result.segments.map((segment) => ({
        ...segment,
        speaker: segment.speaker === "SPEAKER_1" ? "SPEAKER_2" : "SPEAKER_1",
      })),
    });
  }

  async function copyText(kind: "notes" | "all") {
    if (!result) return;
    const text =
      kind === "notes"
        ? [result.summary.title, "", result.summary.narrative].join("\n")
        : toMarkdown(result, names);
    await navigator.clipboard.writeText(text);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1600);
  }

  function downloadMarkdown() {
    if (!result) return;
    const blob = new Blob([toMarkdown(result, names)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${result.summary.title.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60)}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const readyLabel = useMemo(() => {
    if (!status) return "Tikrinama sąranka…";
    if (status.preferred === "gemini") return "Paruošta lietuviškai transkribuoti su Gemini";
    if (status.preferred === "groq") return "Paruošta su Groq Whisper (pigesnis kelias)";
    return "Peržiūros veiksena — pridėkite raktą tikram įrašui";
  }, [status]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl space-y-3">
          <p className="text-xs font-medium tracking-[0.22em] text-speaker-one uppercase">Du balsai</p>
          <h1 className="font-heading text-4xl leading-[1.05] text-balance sm:text-5xl">
            Įrašykite susitikimą. Sistema atskirs, kas kalbėjo, ir parašys viso pokalbio aprašymą.
          </h1>
          <p className="max-w-xl text-base text-muted-foreground">
            Startas, stopas, lietuviškas transkriptas ir santrauka. Kalbėtojas 1 ir Kalbėtojas 2 žymimi atskirai — tinka dviem žmonėms prie vieno mikrofono.
          </p>
        </div>
        <Badge variant="outline" className="h-auto max-w-xs px-3 py-2 text-left text-xs leading-5 font-normal whitespace-normal">
          {readyLabel}
        </Badge>
      </header>

      {status && !status.ready ? (
        <Alert>
          <Sparkles />
          <AlertTitle>Kad tikras įrašas veiktų, reikia vieno nemokamo rakto</AlertTitle>
          <AlertDescription>
            <ol className="mt-2 list-decimal space-y-1 pl-4">
              <li>
                Atidarykite{" "}
                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                  Google AI Studio
                </a>{" "}
                ir sukurkite raktą (užtenka nemokamo tarifo).
              </li>
              <li>
                Projekto šaknyje sukurkite <code>.env.local</code> su eilute{" "}
                <code>GEMINI_API_KEY=jūsų_raktas</code>.
              </li>
              <li>Perleiskite <code>npm run dev</code> ir leiskite mikrofoną Chrome naršyklėje.</li>
            </ol>
            <p className="mt-2">
              Pigiausia tiksli transkripcija be balsų iš garso — Groq (<code>GROQ_API_KEY</code>). Gemini geriau atskiria balsus.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <Card className="bg-[linear-gradient(180deg,oklch(0.23_0.03_250),oklch(0.18_0.02_250))] text-white ring-white/10">
          <CardHeader>
            <CardTitle className="text-white">Įrašas</CardTitle>
            <CardDescription className="text-white/65">
              Kalbėkite lietuviškai. Po Stop svetainė transkribuoja visą pokalbį.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-2xl bg-black/25 px-3 py-4 ring-1 ring-white/10">
              <Waveform stream={recorder.stream} active={recorder.isRecording} />
              <div className="mt-3 flex items-center justify-between text-sm text-white/70">
                <span className={cn("inline-flex items-center gap-2", recorder.isRecording && "text-red-300")}>
                  <span className={cn("size-2 rounded-full bg-white/30", recorder.isRecording && "animate-pulse bg-red-400")} />
                  {recorder.isRecording ? "Įrašoma" : processing ? "Apdorojama" : "Laukiama"}
                </span>
                <span className="font-mono tabular-nums text-lg text-white">
                  {formatClock(recorder.elapsedMs)}
                </span>
              </div>
            </div>

            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => void onToggleRecord()}
                disabled={processing || recorder.state === "requesting" || recorder.state === "stopping"}
                className={cn(
                  "flex size-24 items-center justify-center rounded-full text-white shadow-[0_16px_40px_-18px_rgba(0,0,0,0.7)] transition disabled:opacity-50",
                  recorder.isRecording
                    ? "bg-red-500 hover:bg-red-400"
                    : "bg-speaker-two hover:brightness-110"
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
                <p className="text-sm font-medium text-white">
                  {recorder.isRecording ? "Stop" : "Start"}
                </p>
                <p className="text-xs text-white/55">
                  {recorder.isRecording ? "Stabdyti ir paruošti užrašus" : "Pradėti mikrofonu"}
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
              <Button
                variant="ghost"
                className="text-white hover:bg-white/10 hover:text-white"
                onClick={() => {
                  setError(null);
                  setResult(DEMO_MEETING);
                  setNames(SPEAKER_LABELS);
                }}
                disabled={processing || recorder.isRecording}
              >
                <Sparkles className="size-4" />
                Pavyzdinis susitikimas
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {displayError ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Nepavyko</AlertTitle>
              <AlertDescription>{displayError}</AlertDescription>
            </Alert>
          ) : null}

          {!result && !processing ? (
            <Card>
              <CardHeader>
                <CardTitle>Dar nėra užrašų</CardTitle>
                <CardDescription>
                  Paspaudę Start kalbėkite dviese. Po Stop čia atsiras transkriptas pagal kalbėtojus ir viso pokalbio aprašymas.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-speaker-one/8 p-4 ring-1 ring-speaker-one/15">
                  <p className="text-xs font-medium tracking-wide text-speaker-one uppercase">Kalbėtojas 1</p>
                  <p className="mt-2 text-sm text-muted-foreground">Pirmas atpažintas balsas. Vardą galėsite pakeisti po įrašo.</p>
                </div>
                <div className="rounded-xl bg-speaker-two/10 p-4 ring-1 ring-speaker-two/20">
                  <p className="text-xs font-medium tracking-wide text-speaker-two uppercase">Kalbėtojas 2</p>
                  <p className="mt-2 text-sm text-muted-foreground">Antras balsas. Jei etiketės apsikeis, sukeiskite jas vienu mygtuku.</p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {result ? (
            <Card>
              <CardHeader className="gap-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="font-heading text-2xl">{result.summary.title}</CardTitle>
                    <CardDescription>
                      {formatClock(result.durationMs)} · {result.speakerCount === 1 ? "vienas balsas" : "du balsai"} ·{" "}
                      {result.provider === "demo" ? "pavyzdys" : result.provider === "gemini" ? "Gemini" : "Groq"}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={swapSpeakers}>
                      <ArrowLeftRight />
                      Sukeisti balsus
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void copyText("notes")}>
                      {copied === "notes" ? <Check /> : <Copy />}
                      Kopijuoti aprašymą
                    </Button>
                    <Button size="sm" onClick={downloadMarkdown}>
                      <Download />
                      Parsisiųsti
                    </Button>
                  </div>
                </div>
                {result.note ? <p className="text-xs text-muted-foreground">{result.note}</p> : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  {(["SPEAKER_1", "SPEAKER_2"] as SpeakerId[]).map((speaker) => (
                    <div key={speaker} className="space-y-1.5">
                      <Label htmlFor={speaker}>{SPEAKER_LABELS[speaker]}</Label>
                      <Input
                        id={speaker}
                        value={names[speaker]}
                        onChange={(event) =>
                          setNames((current) => ({ ...current, [speaker]: event.target.value }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="summary">
                  <TabsList>
                    <TabsTrigger value="summary">Aprašymas</TabsTrigger>
                    <TabsTrigger value="transcript">Pokalbis</TabsTrigger>
                  </TabsList>
                  <TabsContent value="summary" className="space-y-4 pt-4">
                    <div className="font-heading text-base leading-8 whitespace-pre-wrap">
                      {result.summary.narrative}
                    </div>
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
                    <Button variant="ghost" size="sm" onClick={() => void copyText("all")}>
                      {copied === "all" ? <Check /> : <Copy />}
                      Kopijuoti viską
                    </Button>
                  </TabsContent>
                  <TabsContent value="transcript" className="space-y-3 pt-4">
                    {result.segments.map((segment, index) => (
                      <article key={`${segment.startMs}-${index}`} className="flex gap-3">
                        <span className="mt-1 w-10 shrink-0 font-mono text-[11px] text-muted-foreground">
                          {formatTimestamp(segment.startMs)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className={cn("mb-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", speakerClass(segment.speaker))}>
                            {names[segment.speaker]}
                          </span>
                          <p className="text-sm leading-6">{segment.text}</p>
                        </div>
                      </article>
                    ))}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <section className="grid gap-4 rounded-2xl bg-card p-5 ring-1 ring-foreground/10 sm:grid-cols-2">
        <div>
          <h2 className="text-sm font-medium">Ką jums reikia padaryti</h2>
          <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-sm text-muted-foreground">
            <li>Sukurkite nemokamą raktą Google AI Studio ir įrašykite jį į <code>.env.local</code>.</li>
            <li>Naudokite Chrome, leiskite mikrofoną, spauskite Start, kalbėkite dviese, tada Stop.</li>
            <li>Jei etiketės apsikeitė — „Sukeisti balsus“. Vardus galite pervadinti.</li>
          </ol>
        </div>
        <div>
          <h2 className="text-sm font-medium">Klausimai jums, kad kitą versiją pataikyčiau</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm text-muted-foreground">
            <li>Ar visada tik du balsai, ar kartais daugiau?</li>
            <li>Ar reikia išsaugoti senus susitikimus, ar užtenka parsisiųsti?</li>
            <li>Ar dažniau įrašinėsite kambaryje, ar kelsite Zoom / Meet failą?</li>
            <li>Ar aprašymą siųsti el. paštu, ar užtenka ekrano?</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
