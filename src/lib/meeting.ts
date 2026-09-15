export type SpeakerId = "SPEAKER_1" | "SPEAKER_2";

export type MeetingSegment = {
  speaker: SpeakerId;
  text: string;
  startMs: number;
  endMs: number;
};

export type MeetingSummary = {
  title: string;
  narrative: string;
  decisions: string[];
  nextSteps: string[];
};

export type MeetingResult = {
  segments: MeetingSegment[];
  summary: MeetingSummary;
  provider: "gemini" | "groq" | "demo";
  language: "lt";
  durationMs: number;
  speakerCount: number;
  note?: string;
};

export type ProviderStatus = {
  gemini: boolean;
  groq: boolean;
  ready: boolean;
  preferred: "gemini" | "groq" | "demo";
};

export const SPEAKER_LABELS: Record<SpeakerId, string> = {
  SPEAKER_1: "Kalbėtojas 1",
  SPEAKER_2: "Kalbėtojas 2",
};

export function parseOffsetMs(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1000 && value % 1 !== 0 ? Math.round(value * 1000) : Math.round(value);
  }
  if (!value) return 0;
  const raw = String(value).trim();
  const seconds = raw.endsWith("s") ? Number.parseFloat(raw.slice(0, -1)) : Number.parseFloat(raw);
  if (!Number.isFinite(seconds)) return 0;
  return Math.round(seconds * 1000);
}

export function normalizeSpeaker(label: string | undefined, index = 0): SpeakerId {
  const value = (label ?? "").toLowerCase();
  if (
    value.includes("2") ||
    value.includes("b") ||
    value.includes("two") ||
    value.endsWith("_1") === false && (value.includes("spk_2") || value.includes("speaker_2"))
  ) {
    if (value.includes("1") && !value.includes("2")) return "SPEAKER_1";
    if (value.includes("2") || value.includes("two") || value.includes("b")) return "SPEAKER_2";
  }
  if (value.includes("2") || value.includes("two") || /\bspk[_-]?2\b/.test(value) || /speaker[_-]?2/.test(value) || /kalb[eė]tojas\s*2/.test(value)) {
    return "SPEAKER_2";
  }
  if (value.includes("1") || value.includes("one") || /spk[_-]?1/.test(value) || /speaker[_-]?0/.test(value) || /kalb[eė]tojas\s*1/.test(value)) {
    return "SPEAKER_1";
  }
  return index % 2 === 0 ? "SPEAKER_1" : "SPEAKER_2";
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatTimestamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function toMarkdown(
  result: MeetingResult,
  names: Record<SpeakerId, string>
): string {
  const date = new Date().toLocaleString("lt-LT");
  const lines = [
    `# ${result.summary.title}`,
    "",
    `Data: ${date}`,
    `Trukmė: ${formatClock(result.durationMs)}`,
    "",
    "## Susitikimo aprašymas",
    "",
    result.summary.narrative,
    "",
  ];

  if (result.summary.decisions.length > 0) {
    lines.push("## Nutarimai", "");
    for (const item of result.summary.decisions) lines.push(`- ${item}`);
    lines.push("");
  }

  if (result.summary.nextSteps.length > 0) {
    lines.push("## Tolesni žingsniai", "");
    for (const item of result.summary.nextSteps) lines.push(`- ${item}`);
    lines.push("");
  }

  lines.push("## Pokalbis pagal kalbėtojus", "");
  for (const segment of result.segments) {
    lines.push(`**${names[segment.speaker]}** (${formatTimestamp(segment.startMs)})`);
    lines.push(segment.text);
    lines.push("");
  }

  return lines.join("\n");
}

export const DEMO_MEETING: MeetingResult = {
  provider: "demo",
  language: "lt",
  durationMs: 187000,
  speakerCount: 2,
  note: "Tai pavyzdinis susitikimas — tikras įrašas apdorojamas, kai pridėsite nemokamą API raktą.",
  segments: [
    {
      speaker: "SPEAKER_1",
      startMs: 0,
      endMs: 22000,
      text: "Sveikas, pradėkime savaitės susitikimą. Noriu perbėgti trečio ketvirčio kampaniją, biudžetą ir kas stringa svetainėje.",
    },
    {
      speaker: "SPEAKER_2",
      startMs: 22000,
      endMs: 48000,
      text: "Gerai. Praėjusią savaitę baigiau naują registracijos langą. Teste konversija pakilo nuo 2,1 iki 3,4 procento, bet mokėjimo žingsnyje vis dar krenta apie ketvirtadalis žmonių.",
    },
    {
      speaker: "SPEAKER_1",
      startMs: 48000,
      endMs: 79000,
      text: "Tai svarbiausia skylė. Siūlau šią savaitę palikti ramybėje naujas funkcijas ir sutvarkyti mokėjimą. Ar spėtum iki ketvirtadienio paruošti trumpesnį kelią — be privalomo adreso, jei žmogus moka kortele?",
    },
    {
      speaker: "SPEAKER_2",
      startMs: 79000,
      endMs: 112000,
      text: "Taip, jei neliestume sąskaitų faktūrų. Kortele mokantiems adresą padarysiu neprivalomą, o įmonėms paliksiu kaip yra. Dar reikia iš banko patvirtinimo, kad 3-D Secure langas lietuviškai nerodo klaidos.",
    },
    {
      speaker: "SPEAKER_1",
      startMs: 112000,
      endMs: 146000,
      text: "Biudžetą tada skiriame taip: 70 procentų — mokėjimo taisymui ir testams, 20 — Facebook reklamai su tuo pačiu tekstu, 10 paliekame rezervui. Reklamos naujo kūrinio nerašome, kol konversija nestabili.",
    },
    {
      speaker: "SPEAKER_2",
      startMs: 146000,
      endMs: 187000,
      text: "Susitariame. Aš iki ketvirtadienio 16 val. atsiųsiu pataisytą mokėjimo eigą ir trumpą matavimų lentelę. Tu tada paleidi reklamą tik jei krepšelio nutraukimas krenta bent iki 15 procentų.",
    },
  ],
  summary: {
    title: "Savaitės susitikimas: mokėjimo kelias ir Q3 kampanija",
    narrative:
      "Susitikime du žmonės aptarė trečio ketvirčio kampaniją ir svetainės konversiją. Kalbėtojas 1 pradėjo nuo savaitės prioritetų: kampanija, biudžetas ir tai, kas stringa svetainėje. Kalbėtojas 2 pranešė, kad naujas registracijos langas teste pakėlė konversiją nuo 2,1 iki 3,4 procento, tačiau mokėjimo žingsnyje vis dar pasitraukia apie ketvirtadalis lankytojų.\n\nAbi pusės sutarė, kad šią savaitę naujų funkcijų nepridedama — visą dėmesį skirti mokėjimo eigai. Kalbėtojas 1 paprašė iki ketvirtadienio paruošti trumpesnį kelią kortelių mokėtojams, be privalomo adreso. Kalbėtojas 2 sutiko, jei liks nepaliestos sąskaitos faktūros: kortelėms adresas taps neprivalomas, įmonėms tvarka nesikeis. Taip pat reikia patikrinti, ar banko 3-D Secure langas lietuviškai neberodo klaidos.\n\nBiudžetas paskirstytas taip: 70 procentų mokėjimo taisymui ir testams, 20 procentų esamai Facebook reklamai, 10 procentų rezervui. Naujo reklamos kūrinio nebus, kol konversija nestabili. Kalbėtojas 2 iki ketvirtadienio 16 val. atsiųs pataisytą mokėjimo eigą ir matavimų lentelę. Kalbėtojas 1 reklamą paleis tik tada, jei krepšelio nutraukimas nukris bent iki 15 procentų.",
    decisions: [
      "Šią savaitę nepridedama naujų funkcijų — prioritetas mokėjimo žingsnis.",
      "Kortelių mokėtojams adresas tampa neprivalomas; įmonių sąskaitos faktūros nesikeičia.",
      "Biudžetas: 70% taisymui ir testams, 20% esamai Facebook reklamai, 10% rezervui.",
      "Reklama paleidžiama tik jei krepšelio nutraukimas nukrenta bent iki 15%.",
    ],
    nextSteps: [
      "Kalbėtojas 2 iki ketvirtadienio 16 val. parengia trumpesnę mokėjimo eigą ir matavimų lentelę.",
      "Kalbėtojas 2 patikrina 3-D Secure lango lietuvišką klaidą su banku.",
      "Kalbėtojas 1 laukia matavimų ir tik tada paleidžia reklamą.",
    ],
  },
};
