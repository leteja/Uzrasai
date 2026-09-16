import { NextResponse } from "next/server";
import { inferSpeakerNames, processMeetingAudio } from "@/lib/transcribe";
import { saveMeeting } from "@/lib/store";
import { publicGeminiError } from "@/lib/gemini";
import { toMarkdown, type MeetingResult } from "@/lib/meeting";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 40 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size === 0) {
      return NextResponse.json({ error: "Įrašo failas nerastas." }, { status: 400 });
    }
    if (audio.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Įrašas per didelis (max 40 MB). Padėkite mikrofoną arčiau ir įrašykite iki ~1 val." },
        { status: 413 }
      );
    }

    const mimeType = String(form.get("mimeType") || audio.type || "audio/webm");
    const durationMs = Number(form.get("durationMs") || 0);
    const liveCaption = String(form.get("liveCaption") || "").trim();
    let participants: string[] = [];
    try {
      participants = JSON.parse(String(form.get("participants") || "[]")) as string[];
      if (!Array.isArray(participants)) participants = [];
    } catch {
      participants = [];
    }
    participants = participants.map((name) => String(name).trim()).filter(Boolean);
    const rawCount = Number(form.get("expectedCount") || 0);
    const expectedCount =
      Number.isFinite(rawCount) && rawCount > 0 ? Math.min(20, Math.max(1, Math.round(rawCount))) : 0;
    const summaryInstructions = String(form.get("summaryInstructions") || "").trim().slice(0, 2000);
    const locked = String(form.get("locked") || "") !== "false";

    const buffer = Buffer.from(await audio.arrayBuffer());
    const extension = mimeType.includes("mp4") ? "m4a" : mimeType.includes("mpeg") ? "mp3" : "webm";

    const result: MeetingResult = await processMeetingAudio({
      buffer,
      mimeType,
      filename: `meeting.${extension}`,
      durationMs,
      liveCaption: liveCaption || undefined,
      participants,
      expectedCount,
      summaryInstructions: summaryInstructions || undefined,
    });

    const speakerNames = result.speakerNames ?? (await inferSpeakerNames(result.segments));

    const saved = await saveMeeting({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      participants: [],
      expectedCount,
      summaryInstructions: summaryInstructions || undefined,
      speakerNames,
      locked,
      lockedAt: locked ? new Date().toISOString() : undefined,
      manuallyEdited: false,
      markdown: toMarkdown(result, speakerNames, [], expectedCount, locked, false),
      result,
    });

    return NextResponse.json(saved);
  } catch (error) {
    const message =
      error instanceof Error &&
      (error.name === "NoSpeechDetectedError" || error.name === "UnreliableTranscriptError")
        ? error.message
        : publicGeminiError(error);
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
    const status =
      code === "NO_PROVIDER" ? 503 : code === "NO_SPEECH" || code === "UNRELIABLE_TRANSCRIPT" ? 400 : 500;
    console.error("process meeting failed:", error);
    return NextResponse.json({ error: message, code }, { status });
  }
}
