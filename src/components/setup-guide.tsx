import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { ProviderStatus } from "@/lib/meeting";
import { KeyRound } from "lucide-react";

export function SetupGuide({ status }: { status: ProviderStatus | null }) {
  if (status?.ready) return null;

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-4 text-sm">
      <p className="font-medium">Savininkui: vieną kartą įrašykite raktą serveryje</p>
      <p className="mt-1 text-muted-foreground">Lankytojai savo Google rakto nekuria. Užtenka `.env.local`:</p>
      <pre className="mt-3 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs">GEMINI_API_KEY=AIzaSy...</pre>
      <ol className="mt-3 list-decimal space-y-1 pl-4 text-muted-foreground">
        <li>
          Raktas:{" "}
          <a className="underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
            aistudio.google.com/apikey
          </a>
        </li>
        <li>Failas šalia `package.json`, vardu `.env.local`.</li>
        <li>Išsaugokite, perkraukite `npm run dev`.</li>
      </ol>
      <Alert className="mt-4">
        <KeyRound />
        <AlertTitle>Kol raktas neįrašytas</AlertTitle>
        <AlertDescription>Galite spausti „Pavyzdinis susitikimas“ kairėje.</AlertDescription>
      </Alert>
    </div>
  );
}
