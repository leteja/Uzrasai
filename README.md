# Užrašai

Įrašykite susitikimą: **Start → Stop → viso pokalbio tekstas ir sutrumpinimas.**

Lankytojams **savo Google rakto kurti nereikia**. Vieną kartą raktą įrašo svetainės savininkas serveryje. Visi naudoja tą patį nemokamą limitą.

## Lankytojui

1. Atidarykite svetainę.
2. Leiskite mikrofoną.
3. **Start**, kalbėkite, **Stop**.
4. Palaukite. Gausite visą pokalbį ir sutrumpinimą. Vardus galite priskirti po to.

## Savininkui (vieną kartą, nemokamai)

Kad lankytojams nereikėtų kurti raktų, `.env.local` serveryje turi būti **jūsų** raktas:

```bash
GEMINI_API_KEY=AIzaSy...
```

Tai tas pats failas šalia `package.json`, kurį jau sukūrėte. Jis niekam nerodomas.

Nemokama, kol telpate į Google AI Studio limitą. Mokėti reikėtų tik jei įrašų taptų labai daug.

## Paleidimas

```bash
npm install
npm run dev
```

[http://127.0.0.1:43124](http://127.0.0.1:43124)
