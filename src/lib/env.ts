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
  const geminiKey = getGeminiKey()?.trim() ?? "";
  const groqKey = getGroqKey()?.trim() ?? "";
  const supabaseUrl = process.env.SUPABASE_URL?.trim() ?? "";
  const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const gemini = Boolean(geminiKey);
  const groq = Boolean(groqKey);
  return {
    gemini,
    groq,
    resend: Boolean(getResendKey()),
    ready: gemini || groq,
    preferred: gemini ? ("gemini" as const) : groq ? ("groq" as const) : ("demo" as const),
    defaultEmail: getDefaultEmailTo(),
    storage: getStorageMode(),
    diagnostics: {
      geminiKeyLength: geminiKey.length,
      groqKeyLength: groqKey.length,
      supabaseUrlSet: Boolean(supabaseUrl),
      supabaseServiceRoleLength: supabaseServiceRole.length,
      vercelEnv: process.env.VERCEL_ENV ?? "local",
    },
  };
}
