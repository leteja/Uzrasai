# Užrašai

Įrašykite kambario susitikimą lietuviškai. Svetainė atskiria **iki 8 balsų**, išsaugo **visą pokalbį ir Markdown**, parašo aprašymą ir gali **išsiųsti jį el. paštu**. Vardų garsiai sakyti nereikia.

## Ką daryti dabar (vieną kartą)

### 1. Sukurkite nemokamą Google raktą

1. Atsidarykite: [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Prisijunkite Gmail paskyra.
3. Paspauskite **Create API key**.
4. Jei klausia projekto — **Create API key in new project** arba Default project.
5. Nukopijuokite raktą. Jis prasideda `AIza`.

### 2. Sukurkite failą projekto šaknyje

Projekto šaknis = aplankas, kuriame yra `package.json`.

1. Cursor kairėje, šalia `package.json`, sukurkite naują failą.
2. Failo vardas turi būti tiksliai **`.env.local`** (taškas priekyje, be `.txt`).
3. Jei failo nematyti, įjunkite paslėptus failus.
4. Į failą įrašykite **vieną eilutę** (be kabučių, be tarpų aplink `=`):

```bash
GEMINI_API_KEY=AIzaSy...čia_jūsų_raktas
```

5. Išsaugokite (Ctrl+S).
6. Terminale: Ctrl+C, tada `npm run dev`.
7. Perkraukite naršyklę. Svetainėje turi rastis žyma **Raktas rastas**.

### 3. (Jeigu reikia laiško) Resend raktas

1. [https://resend.com/api-keys](https://resend.com/api-keys) — nemokama paskyra.
2. Create API Key, nukopijuokite `re_...`.
3. Tame pačiame `.env.local` apačioje:

```bash
RESEND_API_KEY=re_...čia_resend_raktas
EMAIL_TO=jusu@pastas.lt
```

4. Vėl Ctrl+C ir `npm run dev`.

Kol nepatvirtintas domenas, Resend siunčia tik į tą pačią dėžutę, kuria registravotės.

## Kaip įrašinėti susitikimą

1. Suveskite, kas sėdi kambaryje (Alanas, Rūta, Tomas…) — **nebūtina sakyti vardų garsiai**.
2. Padėkite telefoną arba nešiojamąjį **per vidurį stalo**.
3. Chrome naršyklėje leiskite mikrofoną.
4. **Start** → kalbėkite apie valandą → **Stop**.
5. Palaukite kelias minutes. Sistema skiria balsus, rašo aprašymą, išsaugo Markdown.
6. Kiekvienam „Kalbėtojui 1, 2, 3…“ parinkite vardą iš sąrašo.
7. Įrašykite el. paštą ir spauskite **Siųsti laišką**. Laiške — aprašymas, priede — visas pokalbis `.md`.

Išsaugota vieta: `data/meetings/` (`.json` + `.md`).

## Paleidimas

```bash
npm install
npm run dev
```

Atidarykite [http://127.0.0.1:43124](http://127.0.0.1:43124)

## Kas jau sukonfigūruota pagal jus

- Daugiau nei du žmonės (iki 8 balsų)
- Visas pokalbis + Markdown archyve
- Kambarys, telefono / kompiuterio mikrofonas
- Vardai suvedami tyliai, ne garsu
- Aprašymas siunčiamas el. paštu
- Tipinė trukmė ~1 val. (automatiškai sustoja ties 70 min.)
