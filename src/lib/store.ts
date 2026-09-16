import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MeetingListItem, SavedMeeting } from "@/lib/meeting";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

const DIR = path.join(process.cwd(), "data", "meetings");

type MeetingRow = {
  id: string;
  created_at: string;
  participants: string[];
  expected_count: number;
  summary_instructions: string | null;
  speaker_names: Record<string, string>;
  markdown: string;
  result: SavedMeeting["result"];
  locked: boolean;
  locked_at: string | null;
  manually_edited?: boolean | null;
  edited_at?: string | null;
};

function toRow(meeting: SavedMeeting): MeetingRow {
  return {
    id: meeting.id,
    created_at: meeting.createdAt,
    participants: meeting.participants,
    expected_count: meeting.expectedCount,
    summary_instructions: meeting.summaryInstructions ?? null,
    speaker_names: meeting.speakerNames,
    markdown: meeting.markdown,
    result: meeting.result,
    locked: meeting.locked,
    locked_at: meeting.lockedAt ?? null,
    manually_edited: Boolean(meeting.manuallyEdited),
    edited_at: meeting.editedAt ?? null,
  };
}

function fromRow(row: MeetingRow): SavedMeeting {
  return {
    id: row.id,
    createdAt: row.created_at,
    participants: row.participants ?? [],
    expectedCount: row.expected_count ?? 0,
    summaryInstructions: row.summary_instructions ?? undefined,
    speakerNames: row.speaker_names ?? {},
    markdown: row.markdown ?? "",
    result: row.result,
    locked: Boolean(row.locked),
    lockedAt: row.locked_at ?? undefined,
    manuallyEdited: Boolean(row.manually_edited),
    editedAt: row.edited_at ?? undefined,
  };
}

function toListItem(meeting: SavedMeeting): MeetingListItem {
  return {
    id: meeting.id,
    createdAt: meeting.createdAt,
    title: meeting.result.summary.title,
    durationMs: meeting.result.durationMs,
    speakerCount: meeting.result.speakerCount,
    locked: Boolean(meeting.locked),
  };
}

async function ensureDir() {
  await mkdir(DIR, { recursive: true });
}

async function saveMeetingToFile(meeting: SavedMeeting): Promise<SavedMeeting> {
  await ensureDir();
  await writeFile(path.join(DIR, `${meeting.id}.json`), JSON.stringify(meeting, null, 2), "utf8");
  await writeFile(path.join(DIR, `${meeting.id}.md`), meeting.markdown, "utf8");
  return meeting;
}

async function getMeetingFromFile(id: string): Promise<SavedMeeting | null> {
  try {
    const raw = await readFile(path.join(DIR, `${id}.json`), "utf8");
    return JSON.parse(raw) as SavedMeeting;
  } catch {
    return null;
  }
}

async function listMeetingsFromFile(): Promise<MeetingListItem[]> {
  try {
    await ensureDir();
    const files = (await readdir(DIR)).filter((name) => name.endsWith(".json"));
    const items: MeetingListItem[] = [];
    for (const file of files) {
      try {
        const meeting = JSON.parse(await readFile(path.join(DIR, file), "utf8")) as SavedMeeting;
        items.push(toListItem(meeting));
      } catch {
        // skip broken files
      }
    }
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

async function deleteMeetingFromFile(id: string): Promise<void> {
  await unlink(path.join(DIR, `${id}.json`)).catch(() => undefined);
  await unlink(path.join(DIR, `${id}.md`)).catch(() => undefined);
}

async function saveMeetingToSupabase(meeting: SavedMeeting): Promise<SavedMeeting> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase nesukonfigūruotas.");

  const { error } = await supabase.from("meetings").upsert(toRow(meeting));
  if (error) {
    if (error.message.includes("row-level security")) {
      throw new Error(
        "Supabase RLS klaida: Vercel kintamajame SUPABASE_SERVICE_ROLE_KEY turi būti service_role raktas (ne anon). Supabase → Settings → API → service_role → Reveal."
      );
    }
    throw new Error(error.message);
  }
  return meeting;
}

async function getMeetingFromSupabase(id: string): Promise<SavedMeeting | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase.from("meetings").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? fromRow(data as MeetingRow) : null;
}

async function listMeetingsFromSupabase(): Promise<MeetingListItem[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("meetings")
    .select("id, created_at, participants, expected_count, summary_instructions, speaker_names, markdown, result, locked, locked_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as MeetingRow[]).map((row) => toListItem(fromRow(row)));
}

async function deleteMeetingFromSupabase(id: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const { error } = await supabase.from("meetings").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export function getStorageMode(): "supabase" | "file" {
  return isSupabaseConfigured() ? "supabase" : "file";
}

export async function saveMeeting(meeting: SavedMeeting): Promise<SavedMeeting> {
  if (isSupabaseConfigured()) return saveMeetingToSupabase(meeting);
  return saveMeetingToFile(meeting);
}

export async function getMeeting(id: string): Promise<SavedMeeting | null> {
  if (isSupabaseConfigured()) return getMeetingFromSupabase(id);
  return getMeetingFromFile(id);
}

export async function listMeetings(): Promise<MeetingListItem[]> {
  if (isSupabaseConfigured()) return listMeetingsFromSupabase();
  return listMeetingsFromFile();
}

export async function deleteMeeting(id: string): Promise<void> {
  if (isSupabaseConfigured()) return deleteMeetingFromSupabase(id);
  return deleteMeetingFromFile(id);
}
