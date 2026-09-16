import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegStatic from "ffmpeg-static";
import type { MeetingSegment } from "@/lib/meeting";
import { uniqueSpeakerIds } from "@/lib/meeting";

const execFileAsync = promisify(execFile);

function resolveFfmpegPath(): string {
  if (ffmpegStatic) return ffmpegStatic;
  return "ffmpeg";
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

export type AudioVolumeStats = {
  meanDb: number | null;
  maxDb: number | null;
};

export async function analyzeAudioVolume(buffer: Buffer, mimeType: string): Promise<AudioVolumeStats> {
  if (buffer.length < 500) {
    return { meanDb: null, maxDb: null };
  }

  const dir = await mkdtemp(path.join(tmpdir(), "uzrasai-vol-"));
  const inputPath = path.join(dir, `input.${extensionForMime(mimeType)}`);
  try {
    await writeFile(inputPath, buffer);
    const { stderr } = await execFileAsync(
      resolveFfmpegPath(),
      ["-y", "-i", inputPath, "-af", "volumedetect", "-f", "null", "-"],
      { timeout: 45_000 }
    );
    const output = String(stderr);
    const meanMatch = output.match(/mean_volume:\s(-?\d+(?:\.\d+)?)\s*dB/);
    const maxMatch = output.match(/max_volume:\s(-?\d+(?:\.\d+)?)\s*dB/);
    return {
      meanDb: meanMatch ? Number(meanMatch[1]) : null,
      maxDb: maxMatch ? Number(maxMatch[1]) : null,
    };
  } catch {
    return { meanDb: null, maxDb: null };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function isSilentAudio(stats: AudioVolumeStats): boolean {
  if (stats.maxDb !== null && stats.maxDb <= -38) return true;
  if (stats.meanDb !== null && stats.meanDb <= -42) return true;
  return false;
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function countSegmentWords(segments: MeetingSegment[]): number {
  return countWords(segments.map((segment) => segment.text).join(" "));
}

export function isTranscriptImplausible(segments: MeetingSegment[], durationMs: number): boolean {
  const text = segments
    .map((segment) => segment.text)
    .join(" ")
    .trim();
  if (!text) return false;

  const words = countWords(text);
  const seconds = Math.max(0.5, durationMs / 1000);
  const speakers = uniqueSpeakerIds(segments).length;

  if (seconds < 3 && words > 4) return true;
  if (seconds < 8 && words > seconds * 2.2) return true;
  if (seconds < 20 && speakers >= 3 && words > seconds * 1.8) return true;
  if (seconds < 45 && speakers >= 5) return true;

  return false;
}

export class NoSpeechDetectedError extends Error {
  code = "NO_SPEECH";

  constructor(message = "Įraše neaptikta kalbos. Patikrinkite mikrofoną ir bandykite dar kartą.") {
    super(message);
    this.name = "NoSpeechDetectedError";
  }
}

export class UnreliableTranscriptError extends Error {
  code = "UNRELIABLE_TRANSCRIPT";

  constructor(
    message = "Transkripcija nepatikima — įrašas greičiausiai per tylus arba per trumpas. Bandykite dar kartą ir kalbėkite aiškiau arčiau mikrofono."
  ) {
    super(message);
    this.name = "UnreliableTranscriptError";
  }
}

export async function assertUsableSpeech(
  buffer: Buffer,
  mimeType: string,
  segments: MeetingSegment[],
  durationMs: number
): Promise<void> {
  const volume = await analyzeAudioVolume(buffer, mimeType);
  const text = segments
    .map((segment) => segment.text)
    .join(" ")
    .trim();

  if (isSilentAudio(volume) || !text) {
    throw new NoSpeechDetectedError();
  }

  if (isTranscriptImplausible(segments, durationMs)) {
    throw new UnreliableTranscriptError();
  }
}

export async function assertAudioHasSpeech(buffer: Buffer, mimeType: string): Promise<void> {
  const volume = await analyzeAudioVolume(buffer, mimeType);
  if (isSilentAudio(volume)) {
    throw new NoSpeechDetectedError();
  }
}
