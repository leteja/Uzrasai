import { Resend } from "resend";
import { NextResponse } from "next/server";
import { getEmailFrom, getResendKey } from "@/lib/env";
import { getMeeting } from "@/lib/store";

export const runtime = "nodejs";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function POST(request: Request) {
  const apiKey = getResendKey();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "El. paštas dar neįjungtas. Sukurkite raktą resend.com ir į .env.local įrašykite RESEND_API_KEY=...",
        code: "NO_RESEND",
      },
      { status: 503 }
    );
  }

  const body = (await request.json()) as { id?: string; to?: string };
  const to = (body.to || "").trim();
  if (!to || !to.includes("@")) {
    return NextResponse.json({ error: "Įrašykite teisingą el. pašto adresą." }, { status: 400 });
  }
  if (!body.id) {
    return NextResponse.json({ error: "Pirma išsaugokite susitikimą." }, { status: 400 });
  }

  const meeting = await getMeeting(body.id);
  if (!meeting) {
    return NextResponse.json({ error: "Susitikimas nerastas archyve." }, { status: 404 });
  }

  const recipients = to.split(/[,;\s]+/).filter((item) => item.includes("@"));
  const decisions = meeting.result.summary.decisions
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  const nextSteps = meeting.result.summary.nextSteps
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  const html = `
    <div style="font-family:Georgia,serif;line-height:1.55;color:#1d2430;max-width:640px">
      <p style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#3f7a7a">Užrašai</p>
      <h1 style="font-size:24px;line-height:1.2">${escapeHtml(meeting.result.summary.title)}</h1>
      <p>${escapeHtml(meeting.result.summary.narrative).replaceAll("\n", "<br/>")}</p>
      ${decisions ? `<h2>Nutarimai</h2><ul>${decisions}</ul>` : ""}
      ${nextSteps ? `<h2>Tolesni žingsniai</h2><ul>${nextSteps}</ul>` : ""}
      <p style="color:#667085;font-size:13px">Visas pokalbis pagal kalbėtojus — prisegtame Markdown faile.</p>
    </div>
  `;

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: getEmailFrom(),
    to: recipients,
    subject: `Susitikimo užrašai: ${meeting.result.summary.title}`,
    html,
    text: meeting.markdown,
    attachments: [
      {
        filename: "susitikimas.md",
        content: Buffer.from(meeting.markdown),
      },
    ],
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
