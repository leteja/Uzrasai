import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProviderStatus } from "@/lib/meeting";
import { KeyRound } from "lucide-react";

export function SetupGuide({ status }: { status: ProviderStatus | null }) {
  if (status?.ready) return null;
  const mailReady = Boolean(status?.resend);

  return (
    <Card className="ring-2 ring-speaker-two/40">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Savininkui: vieną kartą įrašykite raktą serveryje</CardTitle>
          <Badge variant="outline">Lankytojams šito daryti nereikia</Badge>
        </div>
        <CardDescription>
          Tai tik svetainės savininkui. Lankytojai ateina, spaudžia Start ir gauna užrašus — savo Google rakto jie nekuria.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 text-sm leading-6">
        <section>
          <h3 className="mb-2 font-medium">1 žingsnis. Sukurkite Google raktą</h3>
          <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
            <li>
              Atsidarykite{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                https://aistudio.google.com/apikey
              </a>
            </li>
            <li>Prisijunkite savo Google paskyra (Gmail).</li>
            <li>Paspauskite mygtuką <strong>Create API key</strong> (Sukurti API raktą).</li>
            <li>
              Jei klausia projekto — rinkitės <strong>Default Gemini project</strong> arba <strong>Create API key in new project</strong>.
            </li>
            <li>
              Ekrane pasirodys ilgas kodas, prasidedantis <code>AIza</code>. Nukopijuokite jį visą (Copy).
            </li>
            <li>Šio kodo niekam nesiųskite ir nekelkite į GitHub.</li>
          </ol>
        </section>

        <section>
          <h3 className="mb-2 font-medium">2 žingsnis. Sukurkite failą projekto šaknyje</h3>
          <p className="mb-2 text-muted-foreground">
            Projekto šaknis — aplankas, kuriame matote failus <code>package.json</code> ir <code>README.md</code>. Failo vardas turi būti tiksliai{" "}
            <code>.env.local</code> (taškas priekyje, jokio .txt gale).
          </p>
          <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
            <li>Cursor / VS Code kairėje failų juostoje spustelėkite tuščią vietą šalia <code>package.json</code>.</li>
            <li>New File / Naujas failas.</li>
            <li>
              Įveskite vardą: <code>.env.local</code> ir spauskite Enter.
            </li>
            <li>Jei failo nematyti — kairėje įjunkite paslėptus failus (Show hidden files), nes vardas prasideda tašku.</li>
            <li>Į failą įrašykite VIENĄ eilutę, be kabučių, be tarpo aplink lygybę. Vietoje AIza... įklijuokite savo raktą:</li>
          </ol>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-muted p-3 text-[13px]">
            GEMINI_API_KEY=AIzaSy...čia_jūsų_nukopijuotas_raktas
          </pre>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-muted-foreground" start={6}>
            <li>Išsaugokite failą: Ctrl+S (Mac: Cmd+S).</li>
            <li>
              Terminale, kur veikia svetainė, spauskite Ctrl+C. Tada vėl: <code>npm run dev</code>.
            </li>
              <li>Perkraukite šią svetainę naršyklėje. Lankytojams instrukcija dingsta — lieka Start ir Stop.</li>
          </ol>
        </section>

        <section>
          <h3 className="mb-2 font-medium">3 žingsnis. El. paštas (kad aprašymas išeitų į pašto dėžutę)</h3>
          <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
            <li>
              Atsidarykite{" "}
              <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer">
                https://resend.com/api-keys
              </a>{" "}
              ir susikurkite nemokamą paskyrą.
            </li>
            <li>Create API Key → nukopijuokite raktą (prasideda <code>re_</code>).</li>
            <li>
              Tame pačiame <code>.env.local</code> failo APAČIOJE pridėkite dar dvi eilutes:
            </li>
          </ol>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-muted p-3 text-[13px]">{`RESEND_API_KEY=re_...čia_resend_raktas
EMAIL_TO=jusu@pastas.lt`}</pre>
          <p className="mt-2 text-muted-foreground">
            Kol nepatvirtinsite savo domeno Resend, laiškai eina tik į tą pačią el. pašto dėžutę, kuria registravotės Resend. Po pakeitimo vėl Ctrl+C ir{" "}
            <code>npm run dev</code>.
            {mailReady ? " El. pašto raktas jau rastas." : ""}
          </p>
        </section>

        <Alert>
            <KeyRound />
            <AlertTitle>Kol raktas neįrašytas serveryje</AlertTitle>
            <AlertDescription>
              Lankytojai savo rakto nekuria. Užtenka vieno rakto serveryje.
            </AlertDescription>
          </Alert>
      </CardContent>
    </Card>
  );
}
