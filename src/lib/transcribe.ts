import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";
import ffmpegStatic from "ffmpeg-static";
import { getGeminiKey, getGroqKey, getProviderStatus } from "@/lib/env";
import { TRANSCRIBE_MODEL, geminiJsonText, publicGeminiError } from "@/lib/gemini";
import {
  MAX_SPEAKERS,
  type MeetingResult,
  type MeetingSegment,
  type MeetingSummary,
  type SpeakerId,
  normalizeSpeaker,
  parseOffsetMs,
  speakerId,
  speakerName,
  uniqueSpeakerIds,
} from "@/lib/meeting";

const execFileAsync = promisify(execFile);
const CHUNK_SECONDS = 24 * 60;

function resolveFfmpegPath(): string {
  if (ffmpegStatic) return ffmpegStatic;
  return "ffmpeg";
}

function needsLongSplit(durationMs: number): boolean {
  return durationMs > CHUNK_SECONDS * 1000 + 30_000;
}

async function prepareGeminiAudio(
  buffer: Buffer,
  mimeType: string,
  durationMs: number
): Promise<{ buffer: Buffer; mimeType: string }> {
  const normalized = asGeminiMime(mimeType);
  if (normalized.includes("mpeg") || normalized.includes("mp3")) {
    return { buffer, mimeType: normalized };
  }
  if (!needsLongSplit(durationMs)) {
    return { buffer, mimeType: normalized };
  }
  return toMp3(buffer, mimeType);
}

const SUMMARY_PROMPT = `Tu esi susitikimų sekretorius. Dirbi tik lietuvių kalba.
Gavai pažodžiui transkribuotą pokalbį su kalbėtojų žymėmis. Pokalbyje gali būti iki ${MAX_SPEAKERS} žmonių.

SVARBU:
- Nekartok transkripto pažodžiui ar beveik pažodžiui. Parašyk savo žodžiais, sutrumpintai ir struktūruotai.
- Rašyk 3–8 pastraipomis (ne punktais, ne dialogo forma), nebent naudotojo instrukcijos nurodo kitaip.
- Sujunk pasikartojimus, bet nepraleisk esminių faktų, skaičių, datų ir sprendimų.
- Nerašyk, ko pokalbyje nebuvo.
- Jei žinai kalbėtojo vardą — naudok jį aprašyme vietoje „Kalbėtojas N“.
- Vardus naudok tik jei jie aiškiai nurodyti (prisistatymas transkripte arba žinomi vardų sąraše). Negalvok vardų.

Grąžink tik JSON:
{
  "title": "trumpas susitikimo pavadinimas",
  "narrative": "3–8 pastraipos. Pilnas, bet glaustas viso pokalbio aprašymas: kas kalbėjo, ką pasakė, kokie argumentai, skaičiai, datos, sutartys."
}`;

type AudioInput = {
  buffer: Buffer;
  mimeType: string;
  filename: string;
  durationMs: number;
  liveCaption?: string;
  participants?: string[];
  expectedCount?: number;
  summaryInstructions?: string;
};

function emptySummary(): MeetingSummary {
  return {
    title: "Susitikimo užrašai",
    narrative: "Nepavyko parengti aprašymo.",
    decisions: [],
    nextSteps: [],
  };
}

function fallbackSummary(segments: MeetingSegment[], names: Record<string, string> = {}): MeetingSummary {
  const speakers = uniqueSpeakerIds(segments);
  const snippets: string[] = [];

  for (const speaker of speakers) {
    const text = segments
      .filter((segment) => segment.speaker === speaker)
      .map((segment) => segment.text.trim())
      .join(" ");
    if (!text) continue;
    const label = speakerName(speaker, names);
    const sentence = text.split(/(?<=[.!?…])\s+/).slice(0, 2).join(" ").trim();
    snippets.push(`${label} ${sentence}`);
  }

  const narrative = snippets.join("\n\n").trim() || "Nepavyko parengti aprašymo.";
  const titleSource = snippets[0] || segments[0]?.text.trim() || "Susitikimo užrašai";
  const title = titleSource.length > 60 ? `${titleSource.slice(0, 57)}…` : titleSource;

  return {
    title: title || "Susitikimo užrašai",
    narrative,
    decisions: [],
    nextSteps: [],
  };
}

function parseSummary(raw: string): MeetingSummary {
  try {
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    const parsed = JSON.parse(jsonStart >= 0 ? raw.slice(jsonStart, jsonEnd + 1) : raw) as Partial<MeetingSummary>;
    return {
      title: parsed.title?.trim() || "Susitikimo užrašai",
      narrative: parsed.narrative?.trim() || "",
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions.map(String).filter(Boolean) : [],
      nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps.map(String).filter(Boolean) : [],
    };
  } catch {
    return {
      title: "Susitikimo užrašai",
      narrative: raw.trim(),
      decisions: [],
      nextSteps: [],
    };
  }
}

function transcriptFromSegments(segments: MeetingSegment[], names: Record<string, string> = {}): string {
  return segments
    .map((segment) => `${speakerName(segment.speaker, names)}: ${segment.text}`)
    .join("\n");
}

const NAME_PATTERNS: RegExp[] = [
  /\b(?:aš|as)\s+(?:es[ui]|esu)\s+([A-ZĄČĘĖĮŠŲŪŽ][a-ząčęėįšųūž]+(?:\s+[A-ZĄČĘĖĮŠŲŪŽ][a-ząčęėįšųūž]+)?)/i,
  /\b(?:mano\s+vardas)\s+(?:yra\s+)?([A-ZĄČĘĖĮŠŲŪŽ][a-ząčęėįšųūž]+)/i,
  /\b(?:čia|cia)\s+([A-ZĄČĘĖĮŠŲŪŽ][a-ząčęėįšųūž]+)/i,
  /\b(?:aš|as)\s+[-–—]\s*([A-ZĄČĘĖĮŠŲŪŽ][a-ząčęėįšųūž]+)/i,
  /\b(?:aš|as)\s+([A-ZĄČĘĖĮŠŲŪŽ][a-ząčęėįšųūž]+)\b/i,
];

const TITLE_PATTERNS: RegExp[] = [
  /\b(?:aš|as)\s+(?:es[ui]|esu)\s+(direktorius|bosas|vadovas|vadybininkas|vadybininkė|finansininkas|finansininkė)/i,
  /\b(?:čia|cia)\s+(direktorius|bosas|vadovas|vadybininkas|vadybininkė)/i,
];

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function inferSpeakerNamesFromText(segments: MeetingSegment[]): Record<string, string> {
  const names: Record<string, string> = {};

  for (const speaker of uniqueSpeakerIds(segments)) {
    const text = segments
      .filter((segment) => segment.speaker === speaker)
      .map((segment) => segment.text)
      .join(" ");

    for (const pattern of NAME_PATTERNS) {
      const match = pattern.exec(text);
      if (match?.[1]) {
        names[speaker] = normalizeName(match[1]);
        break;
      }
    }

    if (names[speaker]) continue;

    for (const pattern of TITLE_PATTERNS) {
      const match = pattern.exec(text);
      if (match?.[1]) {
        names[speaker] = normalizeName(match[1]);
        break;
      }
    }
  }

  return names;
}

function namesHint(names: Record<string, string>): string {
  const entries = Object.entries(names).filter(([, value]) => value.trim());
  if (entries.length === 0) return "";
  const lines = entries.map(([speaker, name]) => `${speaker} → ${name}`).join("\n");
  return `\nŽinomi kalbėtojų vardai (naudok aprašyme):\n${lines}\n`;
}

function summaryInstructionsHint(instructions?: string): string {
  const text = instructions?.trim();
  if (!text) return "";
  return `\nNAUDOTOJO INSTRUKCIJOS (laikykitės jų pirmiausia, jei nesikerta su faktais iš transkripto):\n${text}\n`;
}

function uniqueSpeakers(segments: MeetingSegment[]): number {
  return new Set(segments.map((segment) => segment.speaker)).size;
}

function mergeAdjacent(segments: MeetingSegment[]): MeetingSegment[] {
  const merged: MeetingSegment[] = [];
  for (const segment of segments) {
    const text = segment.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const last = merged[merged.length - 1];
    if (last && last.speaker === segment.speaker) {
      last.text = `${last.text} ${text}`.trim();
      last.endMs = Math.max(last.endMs, segment.endMs);
    } else {
      merged.push({ ...segment, text });
    }
  }
  return merged;
}

function mapUnknownSpeakers(raw: { speaker: string; text: string; startMs: number; endMs: number }[]): MeetingSegment[] {
  const order: string[] = [];
  return mergeAdjacent(
    raw
      .filter((item) => item.text.trim())
      .map((item) => {
        const key = item.speaker || "unknown";
        if (!order.includes(key)) order.push(key);
        const numbered = /(\d+)/.exec(key);
        const index = numbered ? Number(numbered[1]) || order.indexOf(key) + 1 : order.indexOf(key) + 1;
        return {
          speaker: speakerId(index === 0 ? 1 : index) as SpeakerId,
          text: item.text,
          startMs: item.startMs,
          endMs: item.endMs,
        };
      })
  );
}

function asGeminiMime(mimeType: string): string {
  if (mimeType.includes("webm")) return "audio/webm";
  if (mimeType.includes("mp4") || mimeType.includes("m4a") || mimeType.includes("aac")) return "audio/mp4";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "audio/mpeg";
  if (mimeType.includes("wav")) return "audio/wav";
  if (mimeType.includes("ogg")) return "audio/ogg";
  return mimeType.split(";")[0] || "audio/webm";
}

function attendeesHint(expectedCount?: number): string {
  const nameRules = `Vardą ar pravardę naudok TIK jei kalbėtojas pats prisistato transkripte (pvz. „aš Alanas“, „čia direktorius“).
Tikras vardas svarbesnis už pareigas ar pravardę (direktorius, bosas).
Jei neprisistatė — naudok SPEAKER_1, SPEAKER_2…
Balsus žymėk SPEAKER_1, SPEAKER_2, SPEAKER_3 ir t. t.`;

  if (!expectedCount || expectedCount <= 0) {
    return `\n${nameRules}`;
  }

  const inRoom = Math.min(20, expectedCount);
  return `\nKambaryje ${inRoom} dalyvių.
${nameRules}`;
}

function extractGeminiTurns(response: {
  text?: string;
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        audioTranscription?: {
          text?: string;
          speakerLabel?: string;
          words?: Array<{ word?: string; startOffset?: string; endOffset?: string }>;
        };
      }>;
    };
  }>;
}): MeetingSegment[] {
  const raw: { speaker: string; text: string; startMs: number; endMs: number }[] = [];

  for (const candidate of response.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      const transcription = part.audioTranscription;
      if (transcription) {
        const words = transcription.words ?? [];
        const text =
          transcription.text?.trim() ||
          words.map((word) => word.word ?? "").join(" ").trim() ||
          part.text?.trim() ||
          "";
        const startMs = parseOffsetMs(words[0]?.startOffset);
        const endMs = parseOffsetMs(words[words.length - 1]?.endOffset);
        raw.push({
          speaker: transcription.speakerLabel || "spk_1",
          text,
          startMs,
          endMs: endMs || startMs,
        });
        continue;
      }
      if (part.text?.trim()) {
        raw.push({
          speaker: "spk_1",
          text: part.text.trim(),
          startMs: 0,
          endMs: 0,
        });
      }
    }
  }

  if (raw.length === 0 && response.text?.trim()) {
    raw.push({ speaker: "spk_1", text: response.text.trim(), startMs: 0, endMs: 0 });
  }

  return mapUnknownSpeakers(raw);
}

type GeminiRestResponse = {
  error?: { message?: string };
  text?: string;
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        audioTranscription?: {
          text?: string;
          speakerLabel?: string;
          words?: Array<{ word?: string; startOffset?: string; endOffset?: string }>;
        };
      }>;
    };
  }>;
};

async function transcribeWithGeminiRest(
  apiKey: string,
  inlineData: { mimeType: string; data: string }
): Promise<GeminiRestResponse> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${TRANSCRIBE_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ inlineData }] }],
        generationConfig: {
          audioTranscriptionConfig: {
            languageCodes: ["lt-LT"],
            diarization: true,
            wordTimestamp: true,
          },
        },
      }),
    }
  );

  const payload = (await response.json()) as GeminiRestResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || `Gemini Transcribe HTTP ${response.status}`);
  }
  return payload;
}

async function toMp3(buffer: Buffer, mimeType: string): Promise<{ buffer: Buffer; mimeType: string }> {
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) {
    return { buffer, mimeType: "audio/mp3" };
  }
  const dir = await mkdtemp(path.join(tmpdir(), "uzrasai-mp3-"));
  const ext = mimeType.includes("mp4") ? "m4a" : mimeType.includes("wav") ? "wav" : mimeType.includes("ogg") ? "ogg" : "webm";
  const inputPath = path.join(dir, `input.${ext}`);
  const outputPath = path.join(dir, "out.mp3");
  try {
    await writeFile(inputPath, buffer);
    await execFileAsync(
      resolveFfmpegPath(),
      ["-y", "-i", inputPath, "-ar", "16000", "-ac", "1", "-c:a", "libmp3lame", "-q:a", "5", outputPath],
      { timeout: 180_000 }
    );
    return { buffer: await readFile(outputPath), mimeType: "audio/mp3" };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function splitAudioChunks(
  buffer: Buffer,
  mimeType: string,
  durationMs: number
): Promise<Array<{ buffer: Buffer; mimeType: string; offsetMs: number }>> {
  const needsSplit = durationMs > CHUNK_SECONDS * 1000 + 30_000;
  if (!needsSplit) {
    return [{ buffer, mimeType: asGeminiMime(mimeType), offsetMs: 0 }];
  }

  const dir = await mkdtemp(path.join(tmpdir(), "uzrasai-"));
  const ext = mimeType.includes("mp4") ? "m4a" : mimeType.includes("mpeg") ? "mp3" : "webm";
  const inputPath = path.join(dir, `input.${ext}`);
  try {
    await writeFile(inputPath, buffer);
    await execFileAsync(
      resolveFfmpegPath(),
      [
        "-y",
        "-i",
        inputPath,
        "-f",
        "segment",
        "-segment_time",
        String(CHUNK_SECONDS),
        "-reset_timestamps",
        "1",
        "-ar",
        "16000",
        "-ac",
        "1",
        "-c:a",
        "libmp3lame",
        "-q:a",
        "5",
        path.join(dir, "chunk-%03d.mp3"),
      ],
      { timeout: 180_000 }
    );
    const files = (await readdir(dir)).filter((name) => name.startsWith("chunk-") && name.endsWith(".mp3")).sort();
    if (files.length === 0) {
      return [{ buffer, mimeType: asGeminiMime(mimeType), offsetMs: 0 }];
    }
    return Promise.all(
      files.map(async (file, index) => ({
        buffer: await readFile(path.join(dir, file)),
        mimeType: "audio/mpeg",
        offsetMs: index * CHUNK_SECONDS * 1000,
      }))
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function unifyChunkSpeakers(ai: GoogleGenAI, chunks: MeetingSegment[][]): Promise<MeetingSegment[]> {
  if (chunks.length === 1) return chunks[0];

    const labeled = chunks
      .map((segments, chunkIndex) => {
        const lines = segments
          .map(
            (segment, i) =>
              `[c${chunkIndex}:${i}] ${segment.speaker} ${segment.startMs}-${segment.endMs}: ${segment.text}`
          )
          .join("\n");
        return `--- DALIS ${chunkIndex + 1} ---\n${lines}`;
      })
      .join("\n\n");

    try {
      const text = await geminiJsonText(
        ai,
        `Sujunk kelių dalių transkripciją į vieną kalbėtojų sistemą.
Kiekviena dalis turi SAVO SPEAKER_N — tas pats žmogus gretimoje dalyje gali būti kitu numeriu.
Priskirk visam pokalbiui nuoseklius SPEAKER_1..SPEAKER_${MAX_SPEAKERS}.
Grąžink JSON: {"map":[{"chunk":0,"index":0,"speaker":"SPEAKER_1"}]}
map turi turėti visus [cX:Y] įrašus.

${labeled}`
      );

      const parsed = JSON.parse(text) as {
        map?: Array<{ chunk?: number; index?: number; speaker?: string }>;
      };
      const lookup = new Map<string, SpeakerId>();
      for (const item of parsed.map ?? []) {
        if (typeof item.chunk === "number" && typeof item.index === "number") {
          lookup.set(`${item.chunk}:${item.index}`, normalizeSpeaker(item.speaker, item.index));
        }
      }

      const merged: MeetingSegment[] = [];
      chunks.forEach((segments, chunkIndex) => {
        segments.forEach((segment, index) => {
          merged.push({
            ...segment,
            speaker: lookup.get(`${chunkIndex}:${index}`) ?? segment.speaker,
          });
        });
      });
      return mergeAdjacent(merged);
    } catch {
      return mergeAdjacent(chunks.flat());
    }
}

async function summarizeWithGemini(
  ai: GoogleGenAI,
  segments: MeetingSegment[],
  participants?: string[],
  expectedCount?: number,
  speakerNames: Record<string, string> = {},
  summaryInstructions?: string
): Promise<MeetingSummary> {
  const text = await geminiJsonText(
    ai,
    `${SUMMARY_PROMPT}${summaryInstructionsHint(summaryInstructions)}${namesHint(speakerNames)}${attendeesHint(expectedCount)}\n\nPOKALBIS:\n${transcriptFromSegments(segments, speakerNames)}`
  );
  return parseSummary(text);
}

async function processWithGeminiFlash(
  ai: GoogleGenAI,
  input: AudioInput,
  inlineData: { mimeType: string; data: string }
): Promise<MeetingResult> {
  const hint = input.liveCaption
    ? `\nNaršyklės gyvos antraštės (gali būti netikslios): ${input.liveCaption}`
    : "";

  const text = await geminiJsonText(ai, {
    text: `Transkribuok šį lietuvišką susitikimo įrašą (gali trukti iki valandos, keli žmonės kambaryje).
Atskirk balsus SPEAKER_1, SPEAKER_2, SPEAKER_3... iki SPEAKER_${MAX_SPEAKERS} pagal tai, kas kalba — ne pagal sakinių eilę, o pagal balsą.
Jei girdėti tik vienas balsas, visus segmentus žymėk SPEAKER_1.
Tada parašyk viso pokalbio aprašymą lietuviškai: sutrumpink, bet aprašyk viską, kas buvo pasakyta.
${summaryInstructionsHint(input.summaryInstructions)}${attendeesHint(input.expectedCount)}
${hint}

Grąžink tik JSON:
{
  "segments": [{"speaker":"SPEAKER_1","text":"...","startMs":0,"endMs":4000}],
  "summary": {
    "title": "...",
    "narrative": "3–8 pastraipos"
  }
}`,
    audio: { mimeType: inlineData.mimeType, data: inlineData.data },
  });

  const parsed = JSON.parse(text) as {
    segments?: Array<{ speaker?: string; text?: string; startMs?: number; endMs?: number }>;
    summary?: Partial<MeetingSummary>;
  };

  const segments = mapUnknownSpeakers(
    (parsed.segments ?? []).map((segment, index) => ({
      speaker: segment.speaker ?? speakerId((index % MAX_SPEAKERS) + 1),
      text: segment.text ?? "",
      startMs: Number(segment.startMs) || 0,
      endMs: Number(segment.endMs) || 0,
    }))
  );

  if (segments.length === 0) {
    throw new Error("Gemini negrąžino transkripcijos.");
  }

  return {
    segments,
    summary: {
      title: parsed.summary?.title?.trim() || "Susitikimo užrašai",
      narrative: parsed.summary?.narrative?.trim() || "",
      decisions: [],
      nextSteps: [],
    },
    provider: "gemini",
    language: "lt",
    durationMs: input.durationMs,
    speakerCount: uniqueSpeakers(segments),
    note: "Naudotas Gemini Flash garso supratimas (atsarginis kelias ilgam įrašui).",
  };
}

async function processWithGemini(input: AudioInput): Promise<MeetingResult> {
  const apiKey = getGeminiKey();
  if (!apiKey) throw new Error("Trūksta GEMINI_API_KEY.");

  const ai = new GoogleGenAI({ apiKey });
  const prepared = await prepareGeminiAudio(input.buffer, input.mimeType, input.durationMs);
  const chunks = await splitAudioChunks(prepared.buffer, prepared.mimeType, input.durationMs);

  const transcribedChunks: MeetingSegment[][] = [];
  for (const chunk of chunks) {
    const transcribed = await transcribeWithGeminiRest(apiKey, {
      mimeType: chunk.mimeType,
      data: chunk.buffer.toString("base64"),
    });
    const segments = extractGeminiTurns(transcribed).map((segment) => ({
      ...segment,
      startMs: segment.startMs + chunk.offsetMs,
      endMs: segment.endMs + chunk.offsetMs,
    }));
    if (segments.length > 0) transcribedChunks.push(segments);
  }

  if (transcribedChunks.length > 0) {
    const segments = await unifyChunkSpeakers(ai, transcribedChunks);
    const speakerNames = await inferSpeakerNames(segments);
    let summary: MeetingSummary;
    try {
      summary = await summarizeWithGemini(
        ai,
        segments,
        input.participants,
        input.expectedCount,
        speakerNames,
        input.summaryInstructions
      );
    } catch (error) {
      console.warn("Santraukos generavimas nepavyko, naudojamas supaprastintas aprašymas:", error);
      summary = fallbackSummary(segments, speakerNames);
    }
    return {
      segments,
      summary,
      speakerNames,
      provider: "gemini",
      language: "lt",
      durationMs: input.durationMs,
      speakerCount: uniqueSpeakers(segments),
      note:
        chunks.length > 1
          ? "Ilgas įrašas padalytas į dalis, kad balsai būtų skiriami visą valandą."
          : undefined,
    };
  }

  console.warn("Gemini Transcribe negrąžino teksto, bandoma Flash su garsu.");
  return processWithGeminiFlash(ai, input, {
    mimeType: prepared.mimeType,
    data: prepared.buffer.toString("base64"),
  });
}

async function processWithGroq(input: AudioInput): Promise<MeetingResult> {
  const apiKey = getGroqKey();
  if (!apiKey) throw new Error("Trūksta GROQ_API_KEY.");

  const groq = new Groq({ apiKey });
  const file = new File([new Uint8Array(input.buffer)], input.filename, { type: asGeminiMime(input.mimeType) });

  const transcription = await groq.audio.transcriptions.create({
    file,
    model: "whisper-large-v3",
    language: "lt",
    response_format: "verbose_json",
    temperature: 0,
  });

  const whisperSegments =
    (
      transcription as {
        segments?: Array<{ text?: string; start?: number; end?: number }>;
      }
    ).segments ?? [];

  const numbered = whisperSegments
    .map((segment) => segment.text?.trim())
    .filter(Boolean)
    .map((text, index) => `[${index}] ${text}`)
    .join("\n");

  const fullText = transcription.text?.trim() || numbered;
  if (!fullText) {
    throw new Error("Whisper negrąžino teksto. Įrašas gali būti per tylus. Padėkite telefoną ar kompiuterį arčiau kalbančiųjų.");
  }

  const captionHint = input.liveCaption ? `\nPapildomos gyvos antraštės: ${input.liveCaption}` : "";

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Tu skiri kelių žmonių lietuvišką pokalbį ir rašai susitikimo aprašymą.
Whisper transkripcija NETURI balsų žymių. Priskirk SPEAKER_1..SPEAKER_${MAX_SPEAKERS} tik tiems, kurie kalba.
${SUMMARY_PROMPT}
${summaryInstructionsHint(input.summaryInstructions)}${attendeesHint(input.expectedCount)}

Papildomai JSON turi turėti segments masyvą su visomis Whisper atkarpomis:
{"segments":[{"index":0,"speaker":"SPEAKER_1"}], "title":"...","narrative":"..."}`,
      },
      {
        role: "user",
        content: `TRUKMĖ: ${Math.round(input.durationMs / 1000)} s\n${captionHint}\n\nTRANSKRIPCIJA:\n${numbered || fullText}`,
      },
    ],
  });

  const parsed = parseSummary(completion.choices[0]?.message?.content ?? "");
  let speakerMap: Record<number, SpeakerId> = {};
  try {
    const jsonStart = (completion.choices[0]?.message?.content ?? "").indexOf("{");
    const jsonEnd = (completion.choices[0]?.message?.content ?? "").lastIndexOf("}");
    const extra = JSON.parse(
      jsonStart >= 0
        ? (completion.choices[0]?.message?.content ?? "").slice(jsonStart, jsonEnd + 1)
        : "{}"
    ) as { segments?: Array<{ index?: number; speaker?: string }> };
    for (const item of extra.segments ?? []) {
      if (typeof item.index === "number") {
        speakerMap[item.index] = normalizeSpeaker(item.speaker, item.index);
      }
    }
  } catch {
    speakerMap = {};
  }

  const segments = mapUnknownSpeakers(
    whisperSegments.length > 0
      ? whisperSegments.map((segment, index) => ({
          speaker: speakerMap[index] ?? speakerId((index % MAX_SPEAKERS) + 1),
          text: segment.text ?? "",
          startMs: Math.round((segment.start ?? 0) * 1000),
          endMs: Math.round((segment.end ?? 0) * 1000),
        }))
      : [
          {
            speaker: "SPEAKER_1",
            text: fullText,
            startMs: 0,
            endMs: input.durationMs,
          },
        ]
  );

  return {
    segments,
    summary: parsed.narrative ? parsed : { ...emptySummary(), narrative: fullText },
    provider: "groq",
    language: "lt",
    durationMs: input.durationMs,
    speakerCount: uniqueSpeakers(segments),
    note: "Groq Whisper neturi tikro balsų atskyrimo. Kalbėtojai priskirti pagal pokalbio eigą — tikslesniam balsui naudokite Gemini raktą.",
  };
}

export async function inferSpeakerNames(segments: MeetingSegment[]): Promise<Record<string, string>> {
  const fromText = inferSpeakerNamesFromText(segments);
  const speakers = uniqueSpeakerIds(segments);
  const missing = speakers.filter((speaker) => !fromText[speaker]);

  if (missing.length === 0) return fromText;

  const apiKey = getGeminiKey();
  if (!apiKey) return fromText;

  const ai = new GoogleGenAI({ apiKey });

  try {
    const text = await geminiJsonText(
      ai,
      `Iš transkripcijos nustatyk kalbėtojų vardus TIK jei jie patys prisistato pokalbyje.
Tinka pravardė ar pareigos (direktorius, bosas), bet tikras vardas turi pirmenybę prieš pareigas.
Jei kalbėtojas neprisistatė — palik tuščią eilutę toje reikšmėje.
Grąžink tik JSON objektą, raktai SPEAKER_1, SPEAKER_2 ir t. t.

POKALBIS:
${transcriptFromSegments(segments, fromText)}`
    );
    const parsed = JSON.parse(text) as Record<string, string>;
    const names = { ...fromText };
    for (const speaker of missing) {
      const value = parsed[speaker]?.trim();
      if (value) names[speaker] = value;
    }
    return names;
  } catch {
    return fromText;
  }
}

export async function processMeetingAudio(input: AudioInput): Promise<MeetingResult> {
  try {
    const status = getProviderStatus();
    if (status.preferred === "gemini") {
      return await processWithGemini(input);
    }
    if (status.preferred === "groq") {
      return await processWithGroq(input);
    }
    throw Object.assign(new Error("Nėra sukonfigūruoto transkripcijos rakto."), { code: "NO_PROVIDER" });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) throw error;
    throw new Error(publicGeminiError(error));
  }
}
