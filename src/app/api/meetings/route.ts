import { NextResponse } from "next/server";
import { deleteMeeting, getMeeting, listMeetings, saveMeeting } from "@/lib/store";
import { toMarkdown, withSpeakerCount, type MeetingResult, type SavedMeeting } from "@/lib/meeting";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await listMeetings());
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<SavedMeeting>;

  if (!body.result) {
    return NextResponse.json({ error: "Nėra susitikimo duomenų." }, { status: 400 });
  }

  const locked = Boolean(body.locked);
  const meeting: SavedMeeting = {
    id: body.id || crypto.randomUUID(),
    createdAt: body.createdAt || new Date().toISOString(),
    participants: body.participants ?? [],
    expectedCount: body.expectedCount ?? body.participants?.length ?? 1,
    speakerNames: body.speakerNames ?? {},
    result: withSpeakerCount(body.result),
    locked,
    lockedAt: locked ? body.lockedAt || new Date().toISOString() : undefined,
    markdown: toMarkdown(
      body.result,
      body.speakerNames ?? {},
      body.participants ?? [],
      body.expectedCount ?? body.participants?.length ?? 1,
      locked
    ),
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
  };
  if (!body.id) return NextResponse.json({ error: "Trūksta id." }, { status: 400 });
  const existing = await getMeeting(body.id);
  if (!existing) return NextResponse.json({ error: "Susitikimas nerastas." }, { status: 404 });

  const wantsContentChange =
    body.result !== undefined || body.speakerNames !== undefined || body.participants !== undefined;
  if (existing.locked && wantsContentChange) {
    return NextResponse.json(
      { error: "Protokolas užrakintas. Teksto, vardų ir kalbėtojų keisti negalima." },
      { status: 403 }
    );
  }
  if (existing.locked && body.locked === false) {
    return NextResponse.json({ error: "Užrakinto protokolo atrakinti negalima." }, { status: 403 });
  }

  const speakerNames = body.speakerNames ?? existing.speakerNames;
  const participants = body.participants ?? existing.participants;
  const result = body.result ? withSpeakerCount(body.result) : existing.result;
  const locked = existing.locked || Boolean(body.locked);
  const saved = await saveMeeting({
    ...existing,
    speakerNames,
    participants,
    result,
    locked,
    lockedAt: locked ? existing.lockedAt || new Date().toISOString() : undefined,
    markdown: toMarkdown(result, speakerNames, participants, existing.expectedCount, locked),
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
