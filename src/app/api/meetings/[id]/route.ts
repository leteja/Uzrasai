import { NextResponse } from "next/server";
import { getMeeting } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const meeting = await getMeeting(id);
  if (!meeting) return NextResponse.json({ error: "Nerasta." }, { status: 404 });
  return NextResponse.json(meeting);
}
