export function getGeminiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;
}

export function getGroqKey(): string | undefined {
  return process.env.GROQ_API_KEY;
}

export function getProviderStatus() {
  const gemini = Boolean(getGeminiKey());
  const groq = Boolean(getGroqKey());
  return {
    gemini,
    groq,
    ready: gemini || groq,
    preferred: gemini ? ("gemini" as const) : groq ? ("groq" as const) : ("demo" as const),
  };
}
