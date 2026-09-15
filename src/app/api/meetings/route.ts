import { NextResponse } from "next/server";
import { deleteMeeting, getMeeting, listMeetings, saveMeeting } from "@/lib/store";
import { DEMO_MEETING, toMarkdown, type SavedMeeting } from "@/lib/meeting";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await listMeetings());
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<SavedMeeting> & { demo?: boolean };
  if (body.demo) {
    const speakerNames = {
      SPEAKER_1: "Alanas",
      SPEAKER_2: "Rūta",
      SPEAKER_3: "Tomas",
      SPEAKER_4: "Justė",
    };
    const participants = ["Alanas", "Rūta", "Tomas", "Justė"];
    const saved = await saveMeeting({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      participants,
      speakerNames,
      markdown: toMarkdown(DEMO_MEETING, speakerNames, participants),
      result: DEMO_MEETING,
    });
    return NextResponse.json(saved);
  }

  if (!body.result) {
    return NextResponse.json({ error: "Nėra susitikimo duomenų." }, { status: 400 });
  }

  const meeting: SavedMeeting = {
    id: body.id || crypto.randomUUID(),
    createdAt: body.createdAt || new Date().toISOString(),
    participants: body.participants ?? [],
    speakerNames: body.speakerNames ?? {},
    result: body.result,
    markdown: toMarkdown(body.result, body.speakerNames ?? {}, body.participants ?? []),
  };
  return NextResponse.json(await saveMeeting(meeting));
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { id?: string; speakerNames?: Record<string, string>; participants?: string[] };
  if (!body.id) return NextResponse.json({ error: "Trūksta id." }, { status: 400 });
  const existing = await getMeeting(body.id);
  if (!existing) return NextResponse.json({ error: "Susitikimas nerastas." }, { status: 404 });
  const speakerNames = body.speakerNames ?? existing.speakerNames;
  const participants = body.participants ?? existing.participants;
  const saved = await saveMeeting({
    ...existing,
    speakerNames,
    participants,
    markdown: toMarkdown(existing.result, speakerNames, participants),
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
