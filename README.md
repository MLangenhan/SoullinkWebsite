# Soul-Link-Plattform

Web-App für Soul-Link-Nuzlockes mit Freunden: Begegnungen pro Route, Soul-Link-Paare, Tode,
Zähler, Run-Timeline und eine öffentliche Zuschauerseite mit Live-Updates. Ersetzt den
[Soullinkbot](https://github.com/MLangenhan/Soullinkbot); der Bot bleibt als zweiter Client erhalten.

**Stack:** Vite · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · Motion · Lenis ·
Supabase (Postgres, Row Level Security, Realtime, anonyme Sitzungen) · Vercel

- Einrichtung (Supabase + Vercel): [`docs/setup.md`](docs/setup.md)
- Architektur und Entscheidungen: [`docs/architektur.md`](docs/architektur.md)

Kein Konto nötig: Mitspieler bekommen einen persönlichen Link, der ihr Gerät mit ihrem Platz verbindet.

## Aufbau

```
src/
  pages/                Start, Einladung, Challenge
  components/challenge/ Routen-Board, Teams, Friedhof, Timeline, Zähler, Einstellungen, Dialoge
  components/           Sprite (animiert), Pokémon-Suche, Effekte (fx/), UI-Bausteine (ui/)
  hooks/ lib/           Datenzugriff, Live-Updates, Stammdaten, Router
supabase/
  migrations/   SQL-Migrationen (Schema, Views, RPCs, RLS; Pokémon-Stammdaten)
  tests/        Supabase-Attrappe und Szenario-Tests
tools/
  generate_species.py   Stammdaten aus PokeAPI erzeugen
  migration/            Import von data.json/deaths.json des alten Bots (mit Testdaten)
data/species.json       Stammdaten für Bot und Frontend
scripts/test-db.sh      Migrationen + alle Tests in einer Wegwerf-Datenbank ausführen
docs/                   Architektur
```

## Lokal starten

```bash
npm install
npx supabase start   # lokaler Supabase-Stack per Docker, spielt die Migrationen ein
cp .env.example .env.local   # URL und Publishable Key aus der Ausgabe eintragen
npm run dev          # http://localhost:5173
```

`npm run build` (Typprüfung + Build), `npm run lint` (oxlint).

## Datenbank testen

Voraussetzung: PostgreSQL 15 oder neuer mit `psql` (lokal oder per Docker) und Python 3.10+.

```bash
# z. B. mit Docker:
docker run -d --name soullink-pg -e POSTGRES_HOST_AUTH_METHOD=trust -p 5432:5432 postgres:16
DATABASE_URL=postgres://postgres@localhost:5432/postgres scripts/test-db.sh
```
