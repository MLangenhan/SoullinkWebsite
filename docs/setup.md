# Einrichtung: Supabase und Vercel

Alles läuft kostenlos: Supabase im Free Tier, Vercel im Hobby-Plan. Dauer: etwa 15 Minuten.

## 1. Supabase-Projekt anlegen

1. Auf [supabase.com](https://supabase.com) anmelden → **New project**.
2. Name z. B. `soullink`, Region **Central EU (Frankfurt)**, ein Datenbank-Passwort erzeugen und im
   Passwortmanager speichern (wird nur für die CLI gebraucht).

## 2. Datenbankschema einspielen

**Variante A, ohne Installation (SQL-Editor):**

1. Im Projekt links **SQL Editor** → **New query**.
2. Den kompletten Inhalt von `supabase/migrations/20261008120000_init.sql` einfügen → **Run**.
3. Neue Abfrage, Inhalt von `supabase/migrations/20261008120100_species.sql` (die 1025 Pokémon) → **Run**.

Die Reihenfolge ist wichtig. Beide Dateien nur einmal ausführen.

**Variante B, mit der Supabase-CLI** (empfohlen, sobald es mehr Migrationen gibt):

```bash
npx supabase login
npx supabase link --project-ref <projekt-ref>   # steht in der Projekt-URL
npx supabase db push                            # spielt alle Dateien aus supabase/migrations ein
```

## 3. Anmeldung ohne Konten einschalten

Die App nutzt **anonyme Sitzungen**: Wer einen Einladungslink öffnet, bekommt im Browser eine Sitzung
ohne E-Mail und Passwort und wird mit seinem Spielerplatz verbunden.

1. **Authentication** → **Sign In / Providers** → **Allow anonymous sign-ins** einschalten → Speichern.
2. **Authentication** → **URL Configuration** → **Site URL** auf die spätere Vercel-Adresse setzen
   (z. B. `https://soullink.vercel.app`). Für lokale Entwicklung zusätzlich `http://localhost:5173`
   unter **Redirect URLs** eintragen.

Supabase begrenzt anonyme Anmeldungen standardmäßig auf 30 pro Stunde und IP-Adresse
(**Authentication** → **Rate Limits**). Für eine Freundesgruppe reicht das.

## 4. Prüfen, dass alles da ist

- **Table Editor**: Tabellen `challenges`, `challenge_members`, `member_devices`, `routes`, `events`,
  `species` (1025 Zeilen) usw. Bei allen steht „RLS enabled“.
- **Database** → **Publications** → `supabase_realtime`: enthält `events`, `challenges`,
  `challenge_members`, `routes` (macht die Migration selbst, für die Live-Updates).
- **Project Settings** → **Data API**: Unter „Exposed schemas“ steht `public` (Standard).

## 5. Schlüssel für die Website holen

**Project Settings** → **API Keys**:

- **Project URL**, z. B. `https://abcdefgh.supabase.co`
- **Publishable key** (`sb_publishable_…`; in älteren Projekten heißt er **anon public**). Dieser
  Schlüssel ist öffentlich und darf ins Frontend: Was er darf, regeln die RLS-Policies.

Den **Secret key** bzw. **service_role key** braucht die App nicht. Nirgends eintragen, nie committen.

## 6. Website auf Vercel veröffentlichen

1. Auf [vercel.com](https://vercel.com) mit GitHub anmelden → **Add New** → **Project** →
   Repository `SoullinkWebsite` importieren. Framework „Vite“ wird erkannt (`vercel.json` ist schon da).
2. Unter **Environment Variables** eintragen:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = Publishable key
3. **Deploy**. Die Adresse anschließend als Site URL in Supabase eintragen (Schritt 3.2).

## 7. Loslegen

**Neu starten:** Website öffnen → **Neue Challenge** → in den Einstellungen die Mitspieler anlegen und
jedem seinen **Gerätelink** schicken. Wer einen zweiten Rechner oder ein Handy nutzt, erstellt sich
unter **Mein Platz** → **Weiteres Gerät verbinden** selbst einen Link.

**Zähler aus dem Bot übernehmen** (`stats.json`):

```bash
python3 tools/migration/migrate_bot_data.py --stats pfad/zu/stats.json \
  --name "Platin Soul Link" --slug platin-soullink --owner Moritz \
  --site-url https://soullink.vercel.app
```

Das Skript zeigt einen Bericht und pro Spieler einen persönlichen Einladungslink. Dann den Inhalt von
`migration.sql` im SQL-Editor ausführen, **zuerst den eigenen Link öffnen** (damit wirst du Leitung)
und die anderen Links verschicken. Die Links gelten 14 Tage und je einmal.

**Gerät verloren oder Browserdaten gelöscht?** Die Leitung meldet unter **Mitglieder & Geräte** die
Geräte ab und erstellt einen neuen Gerätelink. Verliert die Leitung selbst alle Geräte, hilft der
SQL-Editor: Einen neuen Link für den Leitungsplatz erzeugt dieses Snippet (Ergebnis an die
Website-Adresse hängen: `https://…/join#<token>`):

```sql
with t as (select 'inv_' || translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_') as token)
insert into public.challenge_invites (challenge_id, token_hash, role, member_id, max_uses, expires_at)
select m.challenge_id, sha256(convert_to(t.token, 'UTF8')), 'owner', m.id, 1, now() + interval '1 day'
from public.challenge_members m, t
where m.role = 'owner' and m.challenge_id = (select id from public.challenges where slug = 'platin-soullink')
returning (select token from t);
```

## 8. Discord-Bot verbinden

In der Website unter **Einstellungen** → **Discord-Bot** → **Token erstellen**. Der Bot braucht:

```
SUPABASE_URL=https://abcdefgh.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
SOULLINK_BOT_TOKEN=slb_…
```

Damit jeder Bot-Befehl dem richtigen Spieler zugeschrieben wird, trägt jeder unter **Mein Platz** seine
Discord-ID ein (Discord: Einstellungen → Erweitert → Entwicklermodus, dann Rechtsklick auf den eigenen
Namen → „Nutzer-ID kopieren“).

## Hinweise zum Free Tier

- Supabase pausiert Projekte nach 7 Tagen ohne Aktivität. Wieder aufwecken: im Dashboard auf
  **Restore** klicken; die Daten bleiben erhalten.
- 500 MB Datenbank reichen für sehr viele Runs (ein Ereignis ist wenige hundert Byte groß).

## Lokale Entwicklung

Voraussetzung: Node.js 20+, Docker.

```bash
npm install
npx supabase start          # lokaler Supabase-Stack, spielt die Migrationen ein
# Ausgabe: API_URL und PUBLISHABLE_KEY in .env.local eintragen (Vorlage: .env.example)
npm run dev                 # http://localhost:5173
```

Datenbank-Tests ohne Docker (nur PostgreSQL und Python): `DATABASE_URL=… npm run test:db`.
