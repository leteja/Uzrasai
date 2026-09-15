# Du balsai

Įrašykite susitikimą lietuviškai. Svetainė atskiria **Kalbėtoją 1** ir **Kalbėtoją 2**, tada parašo viso pokalbio aprašymą — sutrumpintą, bet be praleistų temų.

## Ką jau turite

- **Start / Stop** mikrofono įrašas
- Gyvos antraštės Chrome naršyklėje (naršyklės atpažinimas, `lt-LT`)
- Po Stop: transkriptas pagal balsus + santrauka, nutarimai, tolesni žingsniai
- Vardų keitimas ir balsų sukeitimas, jei etiketės apsikeitė
- Garso failo įkėlimas ir pavyzdinis susitikimas be rakto
- Eksportas į Markdown

Įrašas lieka jūsų naršyklėje ir serveryje apdorojamas tik tam kartui — paskyros ir duomenų bazės nėra.

## Ką jums reikia padaryti

Tikras lietuviškas transkriptas kainuoja API kvietimą. Pigiausias kelias, kuris **moka lietuviškai ir skiria balsus**:

1. Sukurkite nemokamą raktą [Google AI Studio](https://aistudio.google.com/apikey).
2. Nukopijuokite `.env.example` į `.env.local` ir įrašykite:
   ```bash
   GEMINI_API_KEY=jūsų_raktas
   ```
3. Paleiskite iš naujo:
   ```bash
   npm install
   npm run dev
   ```
4. Naršyklėje (geriausia **Chrome**) leiskite mikrofoną ir paspauskite Start.

Gemini 3.5 Transcribe palaiko `lt-LT` ir tikrą balsų atskyrimą. Santrauką rašo Gemini Flash. Google AI Studio nemokamo tarifo užtenka asmeniniams susitikimams.

### Dar pigesnė transkripcija (be tikro balso atskyrimo)

Jei norite tik Whisper ir nulinės kainos transkripcijai, [Groq](https://console.groq.com/keys) turi dosnų nemokamą limitą ir Whisper moka lietuviškai. Tada kalbėtojai priskiriami pagal pokalbio eigą, ne pagal balsą:

```bash
GROQ_API_KEY=jūsų_raktas
```

Jei abu raktai yra, naudojamas **Gemini**.

## Vietinis paleidimas

```bash
npm install
npm run dev
```

Svetainė: [http://127.0.0.1:43124](http://127.0.0.1:43124)

## Ką nutariau už jus (galite pakeisti)

- Tik **du** kalbėtojai
- Kalba: **lietuvių**
- Be prisijungimo ir be senų susitikimų archyvo
- Apdorojimas po Stop, ne gyvai žodis po žodžio (gyvos antraštės — tik pagalbinės)
- Vienas mikrofonas (du žmonės kambaryje arba skambutis per garsiakalbį)

## Klausimai, kad kitą kartą pataikyčiau tiksliau

1. Ar visada tik du balsai, ar kartais trys ir daugiau?
2. Ar užrašus reikia išsaugoti (paskyra, istorija), ar užtenka parsisiųsti?
3. Ar įrašas visada kambaryje prie vieno mikrofono, ar dažnai iš Zoom / Meet failo?
4. Ar kalbėtojus vadinsite vardais (pvz. Alanas / Rūta) jau prieš įrašą?
5. Ar reikia siųsti aprašymą el. paštu, ar užtenka ekrano ir Markdown?
6. Kiek trunka tipiškas susitikimas — 10 min., 45 min., ar valanda?

## Kaina trumpai

| Kelias | Lietuviškai | Balsų atskyrimas | Kaina |
| --- | --- | --- | --- |
| Gemini (rekomenduojama) | taip, `lt-LT` | taip, iš garso | nemokamas AI Studio tarifas |
| Groq Whisper | taip | ne iš garso, tik iš teksto | labai pigus / nemokamas limitas |
| Be rakto | pavyzdys | pavyzdys | 0 €, tik peržiūrai |
