# Užrašai

Įrašykite susitikimą: **Start → Stop → viso pokalbio tekstas ir sutrumpinimas.**

Lankytojams **savo Google rakto kurti nereikia**. Vieną kartą raktą įrašo svetainės savininkas serveryje.

## Lokalus paleidimas

```bash
npm install
cp .env.example .env.local
# Įrašykite GEMINI_API_KEY į .env.local
npm run dev
```

Atidarykite [http://127.0.0.1:43124](http://127.0.0.1:43124)

Be Supabase duomenys saugomi vietiniame `data/meetings/` aplanke. **Produkcijoje reikia Supabase** — Vercel diske duomenys neišlieka.

---

## Kaip paleisti tikrą svetainę (GitHub + Supabase + Vercel)

Reikia trijų dalykų:

| Dalis | Kam skirta |
|-------|------------|
| **GitHub** | Kodo saugykla ir automatinis diegimas |
| **Supabase** | Susitikimų duomenų bazė (PostgreSQL) |
| **Vercel** | Next.js svetainės hostingas (nemokamas planas) |

### 1 žingsnis. GitHub repozitorija

1. [github.com/new](https://github.com/new) — sukurkite naują repozitoriją (pvz. `uzrasai`).
2. Lokaliai arba per Cursor Cloud Agent nusiųskite kodą:

```bash
git remote add github https://github.com/JUSU_VARDAS/uzrasai.git
git push -u github main
```

Jei dar neturite `main` šakos, sujunkite esamą šaką arba sukurkite PR ir sujunkite į `main`.

### 2 žingsnis. Supabase projektas

1. Eikite į [supabase.com](https://supabase.com) → **Start your project** → sukurkite organizaciją ir projektą.
2. Projekte atidarykite **SQL Editor** → **New query**.
3. Nukopijuokite ir paleiskite visą failą:

`supabase/migrations/20250915120000_create_meetings.sql`

4. Eikite į **Project Settings → API** ir nusirašykite:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** raktą (secret) → `SUPABASE_SERVICE_ROLE_KEY`

> **Svarbu:** `service_role` raktą naudokite tik serveryje (Vercel env). Niekada nekelkite į GitHub ir neįdėkite į `NEXT_PUBLIC_` kintamuosius.

5. Lentelė `meetings` turi RLS įjungtą be viešų taisyklių — duomenis pasiekia tik jūsų serveris per `service_role`.

### 3 žingsnis. Vercel diegimas

1. Eikite į [vercel.com](https://vercel.com) → prisijunkite su **GitHub**.
2. **Add New → Project** → pasirinkite savo `uzrasai` repozitoriją.
3. Framework: **Next.js** (atpažįstamas automatiškai).
4. **Environment Variables** — pridėkite:

| Kintamasis | Reikšmė |
|------------|---------|
| `GEMINI_API_KEY` | Jūsų raktas iš [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role raktas |
| `RESEND_API_KEY` | *(nebūtina)* el. paštui |
| `EMAIL_TO` | *(nebūtina)* numatytas gavėjas |

5. Spauskite **Deploy**.

Po ~2 min. gausite nuorodą, pvz. `https://uzrasai.vercel.app`.

### 4 žingsnis. Patikrinimas

1. Atidarykite svetainę.
2. Viršuje neturėtų rodyti „Savininkui reikia rakto“ — jei rodo, `GEMINI_API_KEY` Vercel aplinkoje neteisingas arba neperdeployinta.
3. Įrašykite trumpą testą → Stop → patikrinkite, ar užrašai išlieka po puslapio perkrovimo (Supabase veikia).
4. Supabase **Table Editor → meetings** — turėtumėte matyti naują eilutę.

### Kas vyksta automatiškai

- Kiekvienas `git push` į `main` → Vercel perbuildina svetainę.
- GitHub Actions (`.github/workflows/ci.yml`) paleidžia `lint` ir `build` kiekvienam push.

### Dažnos problemos

| Problema | Sprendimas |
|----------|------------|
| Užrašai dingsta po perkrovimo | Trūksta `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` Vercel aplinkoje |
| „Nepavyko apdoroti įrašo“ | Patikrinkite `GEMINI_API_KEY`; ilgi įrašai gali viršyti Vercel laiko limitą |
| El. laiškai neateina | Pridėkite `RESEND_API_KEY` ir `EMAIL_TO`; Resend reikalauja patvirtinto domeno gamybai |
| SQL klaida kuriant lentelę | Paleiskite migraciją dar kartą SQL Editor — `create table if not exists` saugu |

### Aplinkos kintamųjų santrauka

Žiūrėkite `.env.example`. Produkcijai privaloma:

- `GEMINI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

---

## Funkcijos

- Balso įrašymas ir transkripcija (Gemini)
- Automatinis kalbėtojų atskyrimas ir vardų atpažinimas
- Sutrumpinimas su jūsų instrukcijomis (trumpas / detalus / punktais)
- Kopijavimas ir el. paštu siuntimas (su Resend)
