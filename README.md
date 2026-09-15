# Užrašai

Įrašykite susitikimą: **Start → Stop → viso pokalbio tekstas ir sutrumpinimas.**

Lankytojams **savo Google rakto kurti nereikia**. Vieną kartą raktą įrašo svetainės savininkas serveryje.

## Lankytojui

1. Viršuje matote, kiek žmonių kambaryje. Skaičių keiskite kairėje. Tylintys gali neprabilti.
2. Jei reikia, įjunkite **Užrakinti po įrašo** — tada protokolo taisyti nebebus galima.
3. Viduryje **Start**. Kol kalbate, gyvai atsiranda eilutės, pvz. `SPEAKER 1 Labas, aš…` (pagal pauzes; po Stop balsai tikslinami).
4. Po Stop taisykite žodžius, vardus ir priskirkite repliką kitam kalbėtojui, jei sistema suklydo.
5. **Kopijuoti visą pokalbį ir sutrumpinimą** nukopijuoja viską. Baigę — **Užrakinti**.

## Savininkui (vieną kartą)

`.env.local` šalia `package.json`:

```bash
GEMINI_API_KEY=AIzaSy...
```

## Paleidimas

```bash
npm install
npm run dev
```

[http://127.0.0.1:43124](http://127.0.0.1:43124)
