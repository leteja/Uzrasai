import { NextResponse } from "next/server";
import { processMeetingAudio } from "@/lib/transcribe";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 24 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size === 0) {
      return NextResponse.json({ error: "Įrašo failas nerastas." }, { status: 400 });
    }
    if (audio.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Įrašas per didelis (max 24 MB). Įrašykite trumpesnį pokalbį." },
        { status: 413 }
      );
    }

    const mimeType = String(form.get("mimeType") || audio.type || "audio/webm");
    const durationMs = Number(form.get("durationMs") || 0);
    const liveCaption = String(form.get("liveCaption") || "").trim();
    const buffer = Buffer.from(await audio.arrayBuffer());
    const extension = mimeType.includes("mp4") ? "m4a" : mimeType.includes("mpeg") ? "mp3" : "webm";

    const result = await processMeetingAudio({
      buffer,
      mimeType,
      filename: `meeting.${extension}`,
      durationMs,
      liveCaption: liveCaption || undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nepavyko apdoroti įrašo.";
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
    const status = code === "NO_PROVIDER" ? 503 : 500;
    console.error("process meeting failed:", error);
    return NextResponse.json({ error: message, code }, { status });
  }
}
