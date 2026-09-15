import { GoogleGenAI } from "@google/genai";

export const FLASH_MODEL = "gemini-3.6-flash";
export const TRANSCRIBE_MODEL = "gemini-3.5-transcribe";

type InteractionLike = {
  outputs?: Array<{ type?: string; text?: string }>;
};

export function interactionText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const rec = value as InteractionLike & { output_text?: string; text?: string };
  if (typeof rec.output_text === "string" && rec.output_text.trim()) return rec.output_text;
  if (typeof rec.text === "string" && rec.text.trim()) return rec.text;
  const chunks: string[] = [];
  for (const output of rec.outputs ?? []) {
    if (typeof output?.text === "string" && output.text.trim()) chunks.push(output.text);
  }
  return chunks.join("\n").trim();
}

export async function geminiJsonText(
  ai: GoogleGenAI,
  input:
    | string
    | Array<{ type: "text"; text: string } | { type: "audio"; data: string; mime_type: "audio/mp3" | "audio/mpeg" | "audio/wav" | "audio/ogg" }>
): Promise<string> {
  const interaction = await ai.interactions.create({
    model: FLASH_MODEL,
    input,
    response_mime_type: "application/json",
    store: false,
  });
  const text = interactionText(interaction);
  if (!text) throw new Error("Gemini negrąžino teksto.");
  return text;
}

export function publicGeminiError(error: unknown): string {
  if (!error) return "Nepavyko apdoroti įrašo.";
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const rec = error as { message?: string; error?: { message?: string; code?: number } };
    const nested = rec.error?.message || rec.message;
    if (nested) return nested;
  }
  if (error instanceof Error) return error.message;
  return "Nepavyko apdoroti įrašo.";
}
