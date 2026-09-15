import { GoogleGenAI } from "@google/genai";

export const FLASH_MODEL = "gemini-3.6-flash";
export const TRANSCRIBE_MODEL = "gemini-3.5-transcribe";

type GeminiJsonInput =
  | string
  | {
      text: string;
      audio?: { mimeType: string; data: string };
    };

export async function geminiJsonText(ai: GoogleGenAI, input: GeminiJsonInput): Promise<string> {
  const parts =
    typeof input === "string"
      ? [{ text: input }]
      : [
          { text: input.text },
          ...(input.audio
            ? [{ inlineData: { mimeType: input.audio.mimeType, data: input.audio.data } }]
            : []),
        ];

  const response = await ai.models.generateContent({
    model: FLASH_MODEL,
    contents: [{ role: "user", parts }],
    config: {
      responseMimeType: "application/json",
    },
  });

  const text = response.text?.trim() ?? "";
  if (!text) throw new Error("Gemini negrąžino teksto.");
  return text;
}

function friendlyGeminiMessage(message: string): string {
  if (message.includes("legacy Interactions API")) {
    return "Gemini API schema pasikeitė. Serveryje atnaujintas SDK — perkraukite puslapį ir bandykite dar kartą.";
  }
  if (message.includes("not found") || message.includes("NOT_FOUND")) {
    return "Gemini modelis nerastas. Patikrinkite, ar raktas turi prieigą prie Gemini 3.6.";
  }
  if (message.includes("high demand") || message.includes("RESOURCE_EXHAUSTED")) {
    return "Gemini šiuo metu apkrautas. Palaukite minutę ir bandykite dar kartą.";
  }
  return message;
}

export function publicGeminiError(error: unknown): string {
  if (!error) return "Nepavyko apdoroti įrašo.";
  if (typeof error === "string") {
    try {
      const parsed = JSON.parse(error) as { error?: { message?: string } };
      if (parsed.error?.message) return friendlyGeminiMessage(parsed.error.message);
    } catch {
      return friendlyGeminiMessage(error);
    }
    return friendlyGeminiMessage(error);
  }
  if (typeof error === "object") {
    const rec = error as { message?: string; error?: { message?: string } };
    const nested = rec.error?.message || rec.message;
    if (nested) {
      try {
        const parsed = JSON.parse(nested) as { error?: { message?: string } };
        if (parsed.error?.message) return friendlyGeminiMessage(parsed.error.message);
      } catch {
        return friendlyGeminiMessage(nested);
      }
      return friendlyGeminiMessage(nested);
    }
  }
  if (error instanceof Error) return friendlyGeminiMessage(error.message);
  return "Nepavyko apdoroti įrašo.";
}
