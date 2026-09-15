import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";
import { getGeminiKey, getGroqKey, getProviderStatus } from "@/lib/env";
import {
  type MeetingResult,
  type MeetingSegment,
  type MeetingSummary,
  type SpeakerId,
  normalizeSpeaker,
  parseOffsetMs,
} from "@/lib/meeting";

const SUMMARY_PROMPT = `Tu esi susitikimų sekretorius. Dirbi tik lietuvių kalba.
Gavai pažodžiui transkribuotą pokalbį su kalbėtojų žymėmis.
Parašyk viso susitikimo aprašymą: sutrumpink pasikartojimus, bet nepraleisk to, kas buvo pasakyta.
Nerašyk, ko pokalbyje nebuvo. Jei nutarimų ar darbų nėra, palik tuščius sąrašus.

Grąžink tik JSON:
{
  "title": "trumpas susitikimo pavadinimas",
  "narrative": "2–5 pastraipos. Pilnas, bet glaustas viso pokalbio aprašymas: kas kalbėjo, ką pasakė, kokie argumentai, skaičiai, datos, sutartys.",
  "decisions": ["nutarimai, jei buvo"],
  "nextSteps": ["ką kas žadėjo padaryti"]
}`;

function emptySummary(): MeetingSummary {
  return {
    title: "Susitikimo užrašai",
    narrative: "Nepavyko parengti aprašymo.",
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

function transcriptFromSegments(segments: MeetingSegment[]): string {
  return segments
    .map((segment) => `${segment.speaker === "SPEAKER_1" ? "Kalbėtojas 1" : "Kalbėtojas 2"}: ${segment.text}`)
    .join("\n");
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
        const index = Math.min(order.indexOf(key), 1);
        return {
          speaker: (index === 0 ? "SPEAKER_1" : "SPEAKER_2") as SpeakerId,
          text: item.text,
          startMs: item.startMs,
          endMs: item.endMs,
        };
      })
  );
}

type AudioInput = {
  buffer: Buffer;
  mimeType: string;
  filename: string;
  durationMs: number;
  liveCaption?: string;
};

function asGeminiMime(mimeType: string): string {
  if (mimeType.includes("webm")) return "audio/webm";
  if (mimeType.includes("mp4") || mimeType.includes("m4a") || mimeType.includes("aac")) return "audio/mp4";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "audio/mpeg";
  if (mimeType.includes("wav")) return "audio/wav";
  if (mimeType.includes("ogg")) return "audio/ogg";
  return mimeType.split(";")[0] || "audio/webm";
}

function extractGeminiTurns(response: {
  text?: string;
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        audioTranscription?: {
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
        const text = words.map((word) => word.word ?? "").join(" ").trim() || part.text?.trim() || "";
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

async function summarizeWithGemini(ai: GoogleGenAI, segments: MeetingSegment[]): Promise<MeetingSummary> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `${SUMMARY_PROMPT}\n\nPOKALBIS:\n${transcriptFromSegments(segments)}`,
    config: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });
  return parseSummary(response.text ?? "");
}

type GeminiRestResponse = {
  error?: { message?: string };
  text?: string;
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        audioTranscription?: {
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
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-transcribe:generateContent?key=${encodeURIComponent(apiKey)}`,
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

async function processWithGemini(input: AudioInput): Promise<MeetingResult> {
  const apiKey = getGeminiKey();
  if (!apiKey) throw new Error("Trūksta GEMINI_API_KEY.");

  const ai = new GoogleGenAI({ apiKey });
  const mimeType = asGeminiMime(input.mimeType);
  const inlineData = {
    mimeType,
    data: input.buffer.toString("base64"),
  };

  try {
    const transcribed = await transcribeWithGeminiRest(apiKey, inlineData);
    const segments = extractGeminiTurns(transcribed);
    if (segments.length === 0) {
      throw new Error("Tuščia transkripcija.");
    }

    const summary = await summarizeWithGemini(ai, segments);
    return {
      segments,
      summary,
      provider: "gemini",
      language: "lt",
      durationMs: input.durationMs,
      speakerCount: uniqueSpeakers(segments),
    };
  } catch (error) {
    console.warn("Gemini Transcribe nepavyko, bandoma Flash su garsu:", error);
    return processWithGeminiFlash(ai, input, inlineData);
  }
}

async function processWithGeminiFlash(
  ai: GoogleGenAI,
  input: AudioInput,
  inlineData: { mimeType: string; data: string }
): Promise<MeetingResult> {
  const hint = input.liveCaption
    ? `\nNaršyklės gyvos antraštės (gali būti netikslios): ${input.liveCaption}`
    : "";

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        parts: [
          {
            text: `Transkribuok šį lietuvišką susitikimo įrašą.
Atskirk du balsus: SPEAKER_1 ir SPEAKER_2 pagal tai, kas kalba — ne pagal sakinių eilę, o pagal balsą.
Jei girdėti tik vienas balsas, visus segmentus žymėk SPEAKER_1.
Tada parašyk viso pokalbio aprašymą lietuviškai: sutrumpink, bet aprasyk viską, kas buvo pasakyta.
${hint}

Grąžink tik JSON:
{
  "segments": [{"speaker":"SPEAKER_1","text":"...","startMs":0,"endMs":4000}],
  "summary": {
    "title": "...",
    "narrative": "2–5 pastraipos",
    "decisions": [],
    "nextSteps": []
  }
}`,
          },
          { inlineData },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  });

  const parsed = JSON.parse(response.text ?? "{}") as {
    segments?: Array<{ speaker?: string; text?: string; startMs?: number; endMs?: number }>;
    summary?: Partial<MeetingSummary>;
  };

  const segments = mapUnknownSpeakers(
    (parsed.segments ?? []).map((segment, index) => ({
      speaker: segment.speaker ?? (index % 2 === 0 ? "SPEAKER_1" : "SPEAKER_2"),
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
      decisions: Array.isArray(parsed.summary?.decisions) ? parsed.summary.decisions.map(String) : [],
      nextSteps: Array.isArray(parsed.summary?.nextSteps) ? parsed.summary.nextSteps.map(String) : [],
    },
    provider: "gemini",
    language: "lt",
    durationMs: input.durationMs,
    speakerCount: uniqueSpeakers(segments),
    note: "Naudotas Gemini Flash garso supratimas (atsarginis kelias).",
  };
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
    throw new Error("Whisper negrąžino teksto. Įrašas gali būti per tylus.");
  }

  const captionHint = input.liveCaption ? `\nPapildomos gyvos antraštės: ${input.liveCaption}` : "";

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Tu skiri dviejų žmonių lietuvišką pokalbį ir rašai susitikimo aprašymą.
Whisper transkripcija NETURI balsų žymių. Priskirk SPEAKER_1 ir SPEAKER_2 pagal pokalbio eigą: klausimai ir atsakymai, kreipiniai, stilius, persidengiančios mintys.
Jei akivaizdžiai kalba vienas žmogus, visur SPEAKER_1.
Visas tekstas — lietuvių kalba.
${SUMMARY_PROMPT}

Papildomai JSON turi turėti segments masyvą su visomis Whisper atkarpomis:
{"segments":[{"index":0,"speaker":"SPEAKER_1"}], "title":"...","narrative":"...","decisions":[],"nextSteps":[]}`,
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
    (whisperSegments.length > 0
      ? whisperSegments.map((segment, index) => ({
          speaker: speakerMap[index] ?? (index % 2 === 0 ? "SPEAKER_1" : "SPEAKER_2"),
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
        ])
  );

  return {
    segments,
    summary: parsed.narrative ? parsed : { ...emptySummary(), narrative: fullText },
    provider: "groq",
    language: "lt",
    durationMs: input.durationMs,
    speakerCount: uniqueSpeakers(segments),
    note: "Groq Whisper neturi tikro balsų atskyrimo. Kalbėtojai priskirti pagal pokalbio eigą — jei reikia tikslaus balso atskyrimo, pridėkite nemokamą Gemini raktą.",
  };
}

export async function processMeetingAudio(input: AudioInput): Promise<MeetingResult> {
  const status = getProviderStatus();
  if (status.preferred === "gemini") {
    return processWithGemini(input);
  }
  if (status.preferred === "groq") {
    return processWithGroq(input);
  }
  throw Object.assign(new Error("Nėra sukonfigūruoto transkripcijos rakto."), { code: "NO_PROVIDER" });
}
