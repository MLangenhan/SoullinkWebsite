# Soul-Link-Plattform

Web-App für Soul-Link-Nuzlockes mit Freunden: Begegnungen pro Route, Soul-Link-Paare, Tode,
Zähler, Run-Timeline und eine öffentliche Zuschauerseite mit Live-Updates. Ersetzt den
[Soullinkbot](https://github.com/MLangenhan/Soullinkbot); der Bot bleibt als zweiter Client erhalten.

**Stand:** Datenbankschema (Supabase/Postgres, Event Sourcing, Row Level Security),
Pokémon-Stammdaten und Import der Bot-Altdaten, alles mit Tests. Das Frontend folgt.

Architektur und Entscheidungen: [`docs/architektur.md`](docs/architektur.md)

## Aufbau

```
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

## Datenbank testen

Voraussetzung: PostgreSQL 15 oder neuer mit `psql` (lokal oder per Docker) und Python 3.10+.

```bash
# z. B. mit Docker:
docker run -d --name soullink-pg -e POSTGRES_HOST_AUTH_METHOD=trust -p 5432:5432 postgres:16
DATABASE_URL=postgres://postgres@localhost:5432/postgres scripts/test-db.sh
```
