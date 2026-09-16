import { NextResponse } from "next/server";
import { deleteMeeting, getMeeting, listMeetings, saveMeeting } from "@/lib/store";
import { toMarkdown, withSpeakerCount, type MeetingResult, type SavedMeeting } from "@/lib/meeting";

export const runtime = "nodejs";

function buildMarkdown(meeting: Pick<SavedMeeting, "result" | "speakerNames" | "participants" | "expectedCount" | "locked" | "manuallyEdited" | "editedAt">) {
  return toMarkdown(
    meeting.result,
    meeting.speakerNames,
    meeting.participants,
    meeting.expectedCount,
    meeting.locked,
    meeting.manuallyEdited,
    meeting.editedAt
  );
}

export async function GET() {
  return NextResponse.json(await listMeetings());
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<SavedMeeting>;

  if (!body.result) {
    return NextResponse.json({ error: "Nėra susitikimo duomenų." }, { status: 400 });
  }

  const locked = body.locked !== false;
  const meeting: SavedMeeting = {
    id: body.id || crypto.randomUUID(),
    createdAt: body.createdAt || new Date().toISOString(),
    participants: body.participants ?? [],
    expectedCount: body.expectedCount ?? 0,
    summaryInstructions: body.summaryInstructions?.trim() || undefined,
    speakerNames: body.speakerNames ?? {},
    result: withSpeakerCount(body.result),
    locked,
    lockedAt: locked ? body.lockedAt || new Date().toISOString() : undefined,
    manuallyEdited: Boolean(body.manuallyEdited),
    editedAt: body.editedAt,
    markdown: buildMarkdown({
      result: withSpeakerCount(body.result),
      speakerNames: body.speakerNames ?? {},
      participants: body.participants ?? [],
      expectedCount: body.expectedCount ?? 0,
      locked,
      manuallyEdited: Boolean(body.manuallyEdited),
      editedAt: body.editedAt,
    }),
  };
  return NextResponse.json(await saveMeeting(meeting));
}

export async function PUT(request: Request) {
  const body = (await request.json()) as {
    id?: string;
    speakerNames?: Record<string, string>;
    participants?: string[];
    result?: MeetingResult;
    locked?: boolean;
    nameSync?: boolean;
    manuallyEdited?: boolean;
    editedAt?: string;
  };
  if (!body.id) return NextResponse.json({ error: "Trūksta id." }, { status: 400 });
  const existing = await getMeeting(body.id);
  if (!existing) return NextResponse.json({ error: "Susitikimas nerastas." }, { status: 404 });

  const unlocking = existing.locked && body.locked === false;
  const locking = !existing.locked && body.locked === true;
  const nextLocked = unlocking ? false : locking ? true : existing.locked;
  const nameSync = body.nameSync === true;

  if (existing.locked && !unlocking && !nameSync) {
    const wantsContentChange =
      body.result !== undefined || body.speakerNames !== undefined || body.participants !== undefined;
    if (wantsContentChange) {
      return NextResponse.json(
        { error: "Protokolas užrakintas. Norėdami keisti tekstą, pirmiausia atrakinkite." },
        { status: 403 }
      );
    }
  }

  const speakerNames = body.speakerNames ?? existing.speakerNames;
  const participants = body.participants ?? existing.participants;
  const result = body.result ? withSpeakerCount(body.result) : existing.result;
  const manuallyEdited =
    body.manuallyEdited !== undefined ? Boolean(body.manuallyEdited) : Boolean(existing.manuallyEdited);
  const editedAt = body.editedAt ?? existing.editedAt;

  const saved = await saveMeeting({
    ...existing,
    speakerNames,
    participants,
    result,
    locked: nextLocked,
    lockedAt: nextLocked ? existing.lockedAt || new Date().toISOString() : undefined,
    manuallyEdited,
    editedAt,
    markdown: buildMarkdown({
      result,
      speakerNames,
      participants,
      expectedCount: existing.expectedCount,
      locked: nextLocked,
      manuallyEdited,
      editedAt,
    }),
  });
  return NextResponse.json(saved);
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Trūksta id." }, { status: 400 });
  await deleteMeeting(id);
  return NextResponse.json({ ok: true });
}
