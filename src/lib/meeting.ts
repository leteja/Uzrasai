export type SpeakerId = `SPEAKER_${number}`;

export const MAX_SPEAKERS = 8;
export const MAX_RECORDING_MS = 70 * 60 * 1000;
export const TARGET_MEETING_MS = 60 * 60 * 1000;

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
  speakerNames?: Record<string, string>;
  note?: string;
};

export type SavedMeeting = {
  id: string;
  createdAt: string;
  participants: string[];
  expectedCount: number;
  summaryInstructions?: string;
  speakerNames: Record<string, string>;
  markdown: string;
  result: MeetingResult;
  locked: boolean;
  lockedAt?: string;
};

export type MeetingListItem = {
  id: string;
  createdAt: string;
  title: string;
  durationMs: number;
  speakerCount: number;
  locked: boolean;
};

export type ProviderStatus = {
  gemini: boolean;
  groq: boolean;
  resend: boolean;
  ready: boolean;
  preferred: "gemini" | "groq" | "demo";
  defaultEmail: string;
  storage: "supabase" | "file";
};

export function speakerId(index: number): SpeakerId {
  const n = Math.min(MAX_SPEAKERS, Math.max(1, index));
  return `SPEAKER_${n}`;
}

export function speakerNumber(id: SpeakerId | string): number {
  const match = String(id).match(/(\d+)/);
  return match ? Number(match[1]) : 1;
}

export function defaultSpeakerLabel(id: SpeakerId | string): string {
  return `Kalbėtojas ${speakerNumber(id)}`;
}

export function listSpeakers(count: number): SpeakerId[] {
  return Array.from({ length: Math.max(1, Math.min(MAX_SPEAKERS, count)) }, (_, i) => speakerId(i + 1));
}

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
  const match = (label ?? "").match(/(\d+)/);
  if (match) {
    const n = Number(match[1]);
    return speakerId(n === 0 ? 1 : n);
  }
  return speakerId((index % MAX_SPEAKERS) + 1);
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
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function speakerName(id: SpeakerId | string, names: Record<string, string>): string {
  return names[id]?.trim() || defaultSpeakerLabel(id);
}

export function uniqueSpeakerIds(segments: MeetingSegment[]): SpeakerId[] {
  const ids = [...new Set(segments.map((segment) => segment.speaker))];
  return ids.length > 0 ? ids : listSpeakers(1);
}

export function withSpeakerCount(result: MeetingResult): MeetingResult {
  return { ...result, speakerCount: uniqueSpeakerIds(result.segments).length };
}

export function toSummaryCopyText(result: MeetingResult, createdAt: string): string {
  const date = new Date(createdAt).toLocaleString("lt-LT");
  return [date, "", result.summary.narrative.trim()].join("\n").trim();
}

export function toTranscriptCopyText(
  result: MeetingResult,
  names: Record<string, string>,
  createdAt: string
): string {
  const date = new Date(createdAt).toLocaleString("lt-LT");
  const lines = [date, ""];

  for (const segment of result.segments) {
    const name = names[segment.speaker]?.trim();
    const label = name || segment.speaker;
    lines.push(`${label}: ${segment.text}`);
  }

  return lines.join("\n").trim();
}

export function toMarkdown(
  result: MeetingResult,
  names: Record<string, string>,
  participants: string[] = [],
  expectedCount = 0,
  locked = false
): string {
  const date = new Date().toLocaleString("lt-LT");
  const lines = [
    `# ${result.summary.title}`,
    "",
    `Data: ${date}`,
    `Trukmė: ${formatClock(result.durationMs)}`,
    `Protokolas: ${locked ? "užrakintas (teksto keisti negalima)" : "neužrakintas (galima taisyti klaidas)"}`,
  ];

  if (expectedCount > 0) {
    lines.push(`Prabilo ${result.speakerCount} iš ${expectedCount}.`);
  }

  lines.push("", "## Susitikimo aprašymas", "", result.summary.narrative, "", "## Visas pokalbis pagal kalbėtojus", "");
  for (const segment of result.segments) {
    lines.push(`**${speakerName(segment.speaker, names)}** (${formatTimestamp(segment.startMs)})`);
    lines.push(segment.text);
    lines.push("");
  }

  return lines.join("\n");
}

export const SPEAKER_PALETTE = [
  { bg: "oklch(0.42 0.14 250 / 0.14)", fg: "oklch(0.35 0.12 250)" },
  { bg: "oklch(0.52 0.11 245 / 0.14)", fg: "oklch(0.42 0.1 245)" },
  { bg: "oklch(0.28 0.02 250 / 0.12)", fg: "oklch(0.22 0.03 250)" },
  { bg: "oklch(0.58 0.08 250 / 0.12)", fg: "oklch(0.45 0.08 250)" },
  { bg: "oklch(0.35 0.04 250 / 0.14)", fg: "oklch(0.28 0.04 250)" },
  { bg: "oklch(0.48 0.06 240 / 0.14)", fg: "oklch(0.38 0.06 240)" },
  { bg: "oklch(0.62 0.05 250 / 0.12)", fg: "oklch(0.5 0.05 250)" },
  { bg: "oklch(0.2 0.02 250 / 0.14)", fg: "oklch(0.16 0.02 250)" },
] as const;

export function speakerTone(id: SpeakerId | string) {
  return SPEAKER_PALETTE[(speakerNumber(id) - 1) % SPEAKER_PALETTE.length];
}

export const DEMO_MEETING: MeetingResult = {
  provider: "demo",
  language: "lt",
  durationMs: 312000,
  speakerCount: 4,
  note: "Pavyzdinis kelių žmonių susitikimas. Tikras įrašas veikia, kai įrašysite Gemini raktą į .env.local.",
  segments: [
    {
      speaker: "SPEAKER_1",
      startMs: 0,
      endMs: 28000,
      text: "Pradėkime. Šiandien keturiese: kampanija, mokėjimas ir kas spėja iki ketvirtadienio. Kas nori pradėti nuo svetainės?",
    },
    {
      speaker: "SPEAKER_2",
      startMs: 28000,
      endMs: 62000,
      text: "Aš. Registracija teste pakilo nuo 2,1 iki 3,4 procento, bet mokėjimo žingsnyje vis dar pasitraukia apie ketvirtadalis. Siūlau šią savaitę neliesti naujų funkcijų.",
    },
    {
      speaker: "SPEAKER_3",
      startMs: 62000,
      endMs: 98000,
      text: "Sutinku dėl prioriteto. Iš finansų pusės: jei adresą kortelėms padarysime neprivalomą, sąskaitų faktūrų juridiniams asmenims neliesti. Bankas vis dar tvirtina 3-D Secure lietuvišką klaidą.",
    },
    {
      speaker: "SPEAKER_4",
      startMs: 98000,
      endMs: 132000,
      text: "Reklamos naujo kūrinio nepaleisiu, kol krepšelis nestabilus. Dabartinį Facebook skelbimą galiu palikti, jei biudžetas nedidės. Duokite signalą, kai nutraukimas nukris bent iki 15 procentų.",
    },
    {
      speaker: "SPEAKER_1",
      startMs: 132000,
      endMs: 176000,
      text: "Tada biudžetas: 70 procentų taisymui ir testams, 20 esamai reklamai, 10 rezervui. Rūta — mokėjimo kelias iki ketvirtadienio 16 val. Tomas — bankas. Justė laukia matavimų. Gerai?",
    },
    {
      speaker: "SPEAKER_2",
      startMs: 176000,
      endMs: 214000,
      text: "Gerai. Iki ketvirtadienio atsiųsiu trumpesnę mokėjimo eigą ir lentelę: kur krenta žmonės.",
    },
    {
      speaker: "SPEAKER_3",
      startMs: 214000,
      endMs: 248000,
      text: "Aš parašysiu bankui šiandien. Jei atsakymo nebus iki trečiadienio, eisime su atsarginiu langu be jų šablono.",
    },
    {
      speaker: "SPEAKER_4",
      startMs: 248000,
      endMs: 312000,
      text: "Supratau. Reklamos nekeičiu, tik pauzė jei matavimai blogesni. Po ketvirtadienio susirašom trumpai raštu, be naujo skambučio.",
    },
  ],
  summary: {
    title: "Keturių žmonių susitikimas: mokėjimo kelias ir Q3 kampanija",
    narrative:
      "Kambaryje kalbėjo keturi žmonės apie trečio ketvirčio kampaniją ir svetainės konversiją. Kalbėtojas 1 pradėjo ir pasiūlė laikytis vieno prioriteto iki ketvirtadienio. Kalbėtojas 2 pranešė, kad registracija teste pakilo nuo 2,1 iki 3,4 procento, tačiau mokėjimo žingsnyje vis dar pasitraukia apie ketvirtadalis lankytojų, todėl naujų funkcijų šią savaitę nepridedama.\n\nKalbėtojas 3 (finansai) sutiko, kad kortelių mokėtojams adresas gali tapti neprivalomas, jei juridinių asmenų sąskaitos faktūros lieka kaip yra, ir priminė neišspręstą banko 3-D Secure lietuvišką klaidą. Kalbėtojas 4 (reklama) atsisakė naujo kūrinio, kol krepšelis nestabilus, ir paliko esamą Facebook skelbimą be didesnio biudžeto.\n\nBiudžetas paskirstytas 70 / 20 / 10: taisymai ir testai, esama reklama, rezervas. Kalbėtojas 2 iki ketvirtadienio 16 val. parengia trumpesnę mokėjimo eigą ir matavimų lentelę. Kalbėtojas 3 tą pačią dieną rašo bankui ir, jei atsakymo nebus iki trečiadienio, eina su atsarginiu langu. Kalbėtojas 4 reklamą keičia tik pagal matavimus; kitas sinchronas — raštu po ketvirtadienio.",
    decisions: [
      "Šią savaitę nepridedama naujų funkcijų — prioritetas mokėjimo žingsnis.",
      "Kortelių mokėtojams adresas neprivalomas; juridinių asmenų sąskaitos nesikeičia.",
      "Biudžetas: 70% taisymui ir testams, 20% esamai Facebook reklamai, 10% rezervui.",
      "Naujo reklamos kūrinio nebus, kol krepšelio nutraukimas nenukris bent iki 15%.",
    ],
    nextSteps: [
      "Kalbėtojas 2 iki ketvirtadienio 16 val. atsiunčia mokėjimo eigą ir matavimų lentelę.",
      "Kalbėtojas 3 šiandien rašo bankui dėl 3-D Secure; trečiadienį — atsarginis variantas.",
      "Kalbėtojas 4 laukia matavimų ir po ketvirtadienio parašo trumpą ataskaitą raštu.",
    ],
  },
};
