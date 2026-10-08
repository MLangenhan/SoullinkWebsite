# Soul-Link-Plattform

Web-App für Soul-Link-Nuzlockes mit Freunden: Begegnungen pro Route, Soul-Link-Paare, Tode,
Zähler, Run-Timeline und eine öffentliche Zuschauerseite mit Live-Updates. Ersetzt den
[Soullinkbot](https://github.com/MLangenhan/Soullinkbot); der Bot bleibt als zweiter Client erhalten.

**Stand:** Datenbankschema (Supabase/Postgres, Event Sourcing, Row Level Security) mit Tests.
Frontend und Migration der Bot-Daten folgen.

Architektur und Entscheidungen: [`docs/architektur.md`](docs/architektur.md)

## Aufbau

```
supabase/
  migrations/   SQL-Migrationen (Schema, Views, RPCs, RLS)
  tests/        Supabase-Attrappe und Szenario-Tests
scripts/
  test-db.sh    Migration + Tests in einer Wegwerf-Datenbank ausführen
docs/           Architektur
```

## Datenbank testen

Voraussetzung: PostgreSQL 15 oder neuer mit `psql` (lokal oder per Docker).

```bash
# z. B. mit Docker:
docker run -d --name soullink-pg -e POSTGRES_HOST_AUTH_METHOD=trust -p 5432:5432 postgres:16
DATABASE_URL=postgres://postgres@localhost:5432/postgres scripts/test-db.sh
```
