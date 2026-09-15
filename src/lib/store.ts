import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MeetingListItem, SavedMeeting } from "@/lib/meeting";

const DIR = path.join(process.cwd(), "data", "meetings");

async function ensureDir() {
  await mkdir(DIR, { recursive: true });
}

export async function saveMeeting(meeting: SavedMeeting): Promise<SavedMeeting> {
  await ensureDir();
  await writeFile(path.join(DIR, `${meeting.id}.json`), JSON.stringify(meeting, null, 2), "utf8");
  await writeFile(path.join(DIR, `${meeting.id}.md`), meeting.markdown, "utf8");
  return meeting;
}

export async function getMeeting(id: string): Promise<SavedMeeting | null> {
  try {
    const raw = await readFile(path.join(DIR, `${id}.json`), "utf8");
    return JSON.parse(raw) as SavedMeeting;
  } catch {
    return null;
  }
}

export async function listMeetings(): Promise<MeetingListItem[]> {
  try {
    await ensureDir();
    const files = (await readdir(DIR)).filter((name) => name.endsWith(".json"));
    const items: MeetingListItem[] = [];
    for (const file of files) {
      try {
        const meeting = JSON.parse(await readFile(path.join(DIR, file), "utf8")) as SavedMeeting;
        items.push({
          id: meeting.id,
          createdAt: meeting.createdAt,
          title: meeting.result.summary.title,
          durationMs: meeting.result.durationMs,
          speakerCount: meeting.result.speakerCount,
        });
      } catch {
        // skip broken files
      }
    }
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function deleteMeeting(id: string): Promise<void> {
  await unlink(path.join(DIR, `${id}.json`)).catch(() => undefined);
  await unlink(path.join(DIR, `${id}.md`)).catch(() => undefined);
}
