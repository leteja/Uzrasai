import { getStorageMode } from "@/lib/store";

export function getGeminiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;
}

export function getGroqKey(): string | undefined {
  return process.env.GROQ_API_KEY;
}

export function getResendKey(): string | undefined {
  return process.env.RESEND_API_KEY;
}

export function getEmailFrom(): string {
  return process.env.RESEND_FROM || process.env.EMAIL_FROM || "Du balsai <beth.t@example.com>";
}

export function getDefaultEmailTo(): string {
  return process.env.EMAIL_TO || "";
}

export function getProviderStatus() {
  const gemini = Boolean(getGeminiKey());
  const groq = Boolean(getGroqKey());
  return {
    gemini,
    groq,
    resend: Boolean(getResendKey()),
    ready: gemini || groq,
    preferred: gemini ? ("gemini" as const) : groq ? ("groq" as const) : ("demo" as const),
    defaultEmail: getDefaultEmailTo(),
    storage: getStorageMode(),
  };
}
