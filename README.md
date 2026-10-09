# Soul Link

Web-App für Soul-Link-Nuzlockes mit Freunden: Begegnungen pro Route, Soul-Link-Paare, Team und Box,
Friedhof, Timeline mit Undo und alle Zähler des alten Discord-Bots, live für alle Mitspieler
gleichzeitig. Ersetzt den [Soullinkbot](https://github.com/MLangenhan/Soullinkbot), der Bot kann
weiter als zweiter Weg zum Eintragen dienen.

**Stack:** Vite · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · Motion · Lenis ·
Supabase (Postgres, Row Level Security, Realtime, anonyme Sitzungen) · GitHub Pages

Wie es gebaut ist und warum: [`docs/architektur.md`](docs/architektur.md)

---

## Inhalt

1. [Benutzung](#benutzung)
2. [Einrichtung: Supabase](#einrichtung-supabase)
3. [Veröffentlichen auf GitHub Pages](#veröffentlichen-auf-github-pages)
4. [Daten aus dem Discord-Bot übernehmen](#daten-aus-dem-discord-bot-übernehmen)
5. [Discord-Bot verbinden](#discord-bot-verbinden)
6. [Demo-Challenge zum Ausprobieren](#demo-challenge-zum-ausprobieren)
7. [Notfall: Zugang der Leitung](#notfall-zugang-der-leitung)
8. [Lokal entwickeln und testen](#lokal-entwickeln-und-testen)
9. [Aufbau des Repositorys](#aufbau-des-repositorys)

---

## Benutzung

### Kein Konto, nur Links

Es gibt keine Anmeldung mit E-Mail oder Passwort. Jeder Spieler bekommt einen **persönlichen Link**.
Wer ihn öffnet, wird mit seinem Platz in der Challenge verbunden; der Browser merkt sich das. Für ein
zweites Gerät (Handy, anderer Rechner) erstellt man sich unter **Einstellungen → Mein Platz → Weiteres
Gerät verbinden** selbst einen neuen Link.

### Begriffe

| Begriff | Bedeutung |
|---|---|
| **Challenge** | eure Gruppe mit Spielern, Routen und Einladungen, z. B. „Platin Soul Link“ |
| **Run** | ein Durchgang von Start bis Wipe oder Sieg; danach beginnt der nächste Run |
| **Soul-Link** | Pokémon derselben Route sind verbunden: Stirbt eins, stirbt der Partner mit |
| **Static** | einmalige Begegnung durch Ansprechen (Sonderregel), eigener Soul-Link auf derselben Route |

### Eine Challenge starten

1. Startseite → **Neue Challenge** → Name, Adresse und deinen Namen eintragen. Du bist jetzt die
   **Leitung**.
2. **Einstellungen → Mitglieder & Geräte**: Mitspieler hinzufügen. Für jeden entsteht ein
   **Gerätelink** (72 Stunden gültig, einmal nutzbar), den du ihm schickst.
3. **Einstellungen → Soul-Links**: „Alle verbunden“ oder **Paare** (Spieler 1↔2, 3↔4, wie im Bot).
   Die Reihenfolge der Spieler ist die Reihenfolge, in der sie hinzugefügt wurden.

### Im Spiel

| Was | Wo |
|---|---|
| Begegnung eintragen | **Begegnung eintragen**: Route wählen oder neu eingeben, Wild oder Static, für jeden Spieler das Pokémon (Suche nach deutschem oder englischem Namen oder Pokédex-Nummer) oder **Verpasst** |
| Später nachtragen | im Tab **Routen** in der eigenen Spalte auf **Nachtragen** klicken; das Pokémon kommt automatisch in den richtigen Soul-Link. Alternativ **Begegnung eintragen** mit derselben Route: Wer schon eingetragen ist, wird angezeigt, nur die Fehlenden werden ergänzt |
| Team oder Box | ergibt sich von selbst: Ein Soul-Link kommt ins Team, sobald alle seine Pokémon da sind und jeder Beteiligte weniger als sechs im Team hat (die schon Gefangenen rücken dann mit nach); sonst in die Box. Unvollständige Soul-Links tauchen in der Box nicht auf |
| Soul-Link verfallen | Hat nicht jeder auf einer Route etwas gefangen: in der Routen-Zeile **Verfallen lassen**. Die Fehlenden gelten als „verpasst“ (zählt und hakt die Route ab), die Route wird ausgeblendet (**Verfallene Routen zeigen** blendet sie wieder ein) |
| Level-Cap | im Kopf der Challenge mit − und + zum vorherigen bzw. nächsten Cap des Spiels; ein neuer Run beginnt wieder beim ersten. Das Spiel wird am Namen erkannt oder unter **Einstellungen → Spielregeln** gewählt |
| Dupes | Suche im Tab **Routen** findet ganze Entwicklungsreihen und sagt, ob die Reihe in diesem Run schon gefangen wurde; beim Eintragen warnt der Dialog. Gilt für alle Spieler zusammen, abschaltbar unter **Spielregeln** |
| Pokédex | Tab **Pokédex**: gegnerisches oder eigenes Pokémon nachschlagen. Typen, Schwächen, Basiswerte, Attacken per Level der gespielten Edition (über dem Level-Cap abgeblendet), wie das eigene Team dagegen steht, Entwicklungen mit Bedingungen, Link ins PokéWiki |
| Calc | Tab **Calc**: Schadensrechner wie im Showdown-Calc (Engine `@smogon/calc`) mit der Generation eures Spiels. Links ein eigenes Pokémon (Level, Wesen, IVs/EVs, Fähigkeit, Item, Attacken; bleibt auf dem Gerät gespeichert), rechts der Gegner. Für Randomizer lassen sich Typen und Basiswerte überschreiben. Ergebnis in beide Richtungen: Schaden in % und KP, KO-Chance, wer schneller ist |
| Sprache | oben rechts **DE/EN**; beim ersten Besuch nach Browsersprache. Pokémon-, Attacken- und Typnamen wechseln mit, eingetragene Daten (Routen, Namen) bleiben |
| Falsches Pokémon eingetragen | Pokémon anklicken → **Falsches Pokémon? Ändern** (rückgängig über die Timeline) |
| Team und Box | Tab **Teams**: Spieler oben wählen, links das Team (6 Plätze), rechts die Box. Pokémon per **Drag and Drop** verschieben; ein Box-Pokémon auf einen belegten Platz tauscht beide, wie im Spiel. Am Handy kurz gedrückt halten. Unter dem Team steht immer, von welcher Route jedes Teammitglied kommt; ein Klick zeigt Herkunft und Soul-Link |
| Teams angleichen | Kommt ein Pokémon ins Team oder in die Box, wechseln seine Soul-Link-Partner bei den anderen automatisch mit (wild und Static getrennt, bei Paaren nur der Partner). Beim Ziehen zeigt eine Vorschau, was bei wem passiert; die anderen bekommen einen Hinweis mit „Rückgängig“. Nur das eigene Team ändern: Schalter „Teams angleichen“ oder Shift beim Ablegen. Nicht angeglichene Pokémon tragen ein gelbes Warnsymbol; in den Details gleicht „Partner angleichen“ sie nach. Ganz ausschalten: **Einstellungen → Teams angleichen** |
| Pokémon suchen | Tab **Routen**: Suchfeld (oder Taste `/`) nach Pokémon (deutsch, englisch, Nummer, Spitzname, auch die gefangene Vorstufe) oder Route |
| Entwicklung, Tod | Pokémon im Tab **Routen** anklicken (oder im Tab **Teams** auf „Entwicklung, Tod und mehr“) |
| Tod mit Ursache, Gegner, Level, Ort | im selben Dialog unter **Tod eintragen**; der Soul-Link-Partner stirbt automatisch mit |
| Verpasste Begegnung ohne Route | Tab **Zähler** → **Verpasste Begegnung** |
| Wipe oder Sieg | **Run beenden**, beim Wipe optional, wer schuld war |
| Versehen rückgängig machen | Tab **Timeline** → **Rückgängig** am Eintrag |
| Frühere Runs ansehen | Pfeile neben der Run-Nummer |

Alles, was jemand einträgt, erscheint bei allen anderen sofort, ohne Neuladen.

### Rollen

| Rolle | darf |
|---|---|
| **Leitung** | alles, dazu Mitglieder, Links, Soul-Link-Modus, Bot-Zugang, Löschen |
| **Spieler** | eintragen, rückgängig machen, eigene Daten und eigene Geräte verwalten |
| **Zuschauer** | nur ansehen (Einladung als Zuschauer unter **Einstellungen → Offene Einladung**) |

Ist eine Challenge **öffentlich** (Einstellungen → Challenge), kann jeder mit der Adresse zuschauen.

### Gerät verloren oder Browserdaten gelöscht

Die Leitung meldet unter **Mitglieder & Geräte** die alten Geräte ab (**Abmelden**) und schickt einen
neuen **Gerätelink**. Hat die Leitung selbst keinen Zugang mehr, siehe
[Notfall: Zugang der Leitung](#notfall-zugang-der-leitung).

---

## Einrichtung: Supabase

Supabase ist die Datenbank. Der Free Tier reicht; Dauer etwa 10 Minuten.

1. Auf [supabase.com](https://supabase.com) anmelden → **New project** → Name z. B. `soullink`,
   Region **Central EU (Frankfurt)**, Datenbank-Passwort erzeugen und speichern.
2. **Schema einspielen:** Links **SQL Editor** → **New query** → den kompletten Inhalt von
   [`supabase/migrations/20261008120000_init.sql`](supabase/migrations/20261008120000_init.sql)
   einfügen → **Run**. Danach in jeweils einer neuen Abfrage genauso
   [`supabase/migrations/20261008120100_species.sql`](supabase/migrations/20261008120100_species.sql)
   (die 1025 Pokémon) und
   [`supabase/migrations/20261009120000_encounter_corrections.sql`](supabase/migrations/20261009120000_encounter_corrections.sql)
   (Pokémon korrigieren) und
   [`supabase/migrations/20261010120000_team_slots.sql`](supabase/migrations/20261010120000_team_slots.sql)
   (Team-Plätze, höchstens sechs im Team) und
   [`supabase/migrations/20261011120000_team_sync.sql`](supabase/migrations/20261011120000_team_sync.sql)
   (Teams angleichen) und
   [`supabase/migrations/20261012120000_rules.sql`](supabase/migrations/20261012120000_rules.sql)
   (Level-Cap, Dupes, verfallene Soul-Links). Reihenfolge beachten, jede Datei nur einmal.

   **Später neue Dateien in `supabase/migrations/`?** Nur die neuen, in der Reihenfolge ihres
   Datums, ebenso im SQL Editor ausführen. Bestehende Daten bleiben erhalten.
   *Alternative mit der CLI:* `npx supabase login`, `npx supabase link --project-ref <ref>`,
   `npx supabase db push`.
3. **Anmeldung ohne Konten einschalten:** **Authentication → Sign In / Providers → Allow anonymous
   sign-ins** → Speichern.
4. **Adresse eintragen:** **Authentication → URL Configuration → Site URL** auf die spätere Adresse
   der Website setzen, z. B. `https://mlangenhan.github.io/SoullinkWebsite/`.
5. **Schlüssel notieren:** **Project Settings → API Keys**: die **Project URL**
   (`https://<ref>.supabase.co`) und den **Publishable key** (`sb_publishable_…`, in älteren Projekten
   „anon public“).

Der Publishable Key ist öffentlich und darf in die Website; was er darf, regeln die
Row-Level-Security-Regeln in der Datenbank. Den **Secret key / service_role key** braucht die App
nicht. Er gehört nirgendwo hin, schon gar nicht ins Repository.

Kontrolle: Im **Table Editor** gibt es u. a. `challenges`, `events` und `species` (1025 Zeilen), alle
mit „RLS enabled“. Unter **Database → Publications → supabase_realtime** stehen `events`,
`challenges`, `challenge_members` und `routes` (für die Live-Updates; macht das Schema selbst).

Hinweis zum Free Tier: Supabase pausiert Projekte nach 7 Tagen ohne Aufrufe. Wieder aufwecken im
Dashboard mit **Restore**; die Daten bleiben erhalten.

---

## Veröffentlichen auf GitHub Pages

Das Repository bringt einen fertigen Workflow mit ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)),
der die Seite bei jedem Push auf `main` baut und veröffentlicht.

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables → New repository variable**:
   - `SUPABASE_URL` = Project URL
   - `SUPABASE_PUBLISHABLE_KEY` = Publishable key

   Bewusst *Variables*, nicht *Secrets*: Beide Werte landen ohnehin im ausgelieferten JavaScript.
3. Pull Request mergen bzw. auf `main` pushen, oder unter **Actions → Website veröffentlichen → Run
   workflow** manuell starten.
4. Die Seite ist danach unter `https://<github-name>.github.io/SoullinkWebsite/` erreichbar. Diese
   Adresse in Supabase als Site URL eintragen (Schritt 4 oben).

**Eigene Domain:** In den Pages-Einstellungen eintragen und zusätzlich die Variable `BASE_PATH` auf `/`
setzen (sonst erwartet die App den Pfad `/SoullinkWebsite/`).

**Einen Pull Request vorher ansehen:** Lokal starten (siehe [unten](#lokal-entwickeln-und-testen)).
Alternativ den Workflow manuell für den Branch starten; dazu unter **Settings → Environments →
github-pages** den Branch bei „Deployment branches“ erlauben.

Jeder Pull Request wird außerdem automatisch geprüft ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)):
Datenbank-Tests (Schema, RLS, Import) sowie Lint, Typprüfung und Build der Website.

---

## Daten aus dem Discord-Bot übernehmen

Jeder Run des Bots liegt in einem eigenen Ordner `data/runs/<id>/` mit `meta.json`, `routes.json`
und `stats.json`. Ein solcher Ordner wird eine Challenge.

**Windows (PowerShell)**, im Ordner der Website; den Pfad zum `runs`-Ordner des Bots in
Anführungszeichen, weil er Leerzeichen enthält:

```powershell
py tools\migration\migrate_bot_data.py --run-dir "C:\Users\bymot\Documents\Projekte\Discord Bot\Soullink Bot\data\runs"
```

Das Skript listet die Runs des Bots auf und fragt, welcher übernommen werden soll und wer die
Leitung bekommt. Falls `py` nicht gefunden wird: `python` statt `py`.

**Linux/macOS:**

```bash
python3 tools/migration/migrate_bot_data.py --run-dir ../Soullinkbot/data/runs
```

Alles lässt sich auch direkt angeben, dann fragt das Skript nichts: `--run-dir` auf einen einzelnen
Run-Ordner, `--owner Moritz`, `--site-url` (Standard: `https://mlangenhan.github.io/SoullinkWebsite`).

Das Skript (nur Python 3.10+, keine Pakete) schreibt **nichts** in die Datenbank, sondern zeigt eine
Zusammenfassung und erzeugt:

- `migration.sql`: der Import, in einer Transaktion,
- `migration-report.json`: was übernommen wurde und was nicht zugeordnet werden konnte,
- einen **persönlichen Link pro Spieler** (nur auf der Konsole, 14 Tage gültig).

Danach:

1. Bericht prüfen (Hinweise am Ende der Ausgabe).
2. Inhalt von `migration.sql` im Supabase-**SQL Editor** ausführen.
3. **Zuerst den eigenen Link öffnen**: Damit wirst du Leitung. Dann die anderen Links verschicken.

Was übernommen wird:

| Bot | Website |
|---|---|
| Name, Spiel, Spieler (`meta.json`) | Challenge und Spieler in derselben Reihenfolge |
| Soul-Link-Paare (Spieler 1↔2, 3↔4) | Soul-Link-Modus „Paare“ (`--links all` für alle gemeinsam) |
| `routes.json` | Begegnungen des laufenden Runs; als gefangen gilt die erste Stufe der Entwicklungslinie |
| `dead_pokemon` | Tode, über die Entwicklungslinie zugeordnet; der Partner stirbt automatisch mit |
| `resets`, `wipes` | abgeschlossene Runs (Wipes mit Verursacher) |
| `deaths`/`alldeaths`, `missed_encounters`/`overall_missed_encounters` | alle Zähler, Run und gesamt, exakt wie im Bot |
| Status „completed“ (Hall of Fame) | der laufende Run endet als Sieg |

Weitere Optionen: `--slug` (Adresse, Standard aus dem Namen), `--visibility public`,
`--alias Jane=Janne` (Spielernamen vereinheitlichen), `--assign Zubat=Linus` (mehrdeutigen Tod
zuordnen), `--help` für alles.

---

## Discord-Bot verbinden

Der Bot bekommt **keinen** geheimen Datenbankschlüssel, sondern ein eigenes Token, das nur für eine
Challenge gilt und jederzeit widerrufen werden kann:

1. Website → **Einstellungen → Discord-Bot → Token erstellen** (wird nur einmal angezeigt).
2. In der `.env` des Bots:

   ```
   SUPABASE_URL=https://<ref>.supabase.co
   SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
   SOULLINK_BOT_TOKEN=slb_…
   ```

3. Jeder Spieler trägt unter **Einstellungen → Mein Platz** seine **Discord-ID** ein (Discord:
   Einstellungen → Erweitert → Entwicklermodus; dann Rechtsklick auf den eigenen Namen → „Nutzer-ID
   kopieren“). So werden Bot-Befehle dem richtigen Spieler zugeschrieben.

Die Datenbank-Schnittstelle für den Bot (`bot_state`, `bot_create_route`, `bot_append_event`) ist
fertig und getestet; der Umbau des Bots selbst folgt.

---

## Demo-Challenge zum Ausprobieren

[`supabase/demo/demo_challenge.sql`](supabase/demo/demo_challenge.sql) legt eine vollständig
gespielte Challenge an: **Pokémon Platin**, vier Spieler in zwei Soul-Link-Paaren, drei Wipes (Veit,
Silvana, Lamina) und ein vierter Run, der gegen Champ Cynthia gewinnt. Dabei sind Tode mit
Partner-Toden, verpasste Begegnungen, Statics, Entwicklungen, eine Korrektur und ein Undo.

1. Inhalt der Datei im Supabase-**SQL Editor** ausführen.
2. Das Ergebnis sind vier persönliche Links (einmal nutzbar, 7 Tage gültig). Den Link der Leitung
   öffnen, die anderen bei Bedarf in einem privaten Fenster oder auf dem Handy.
3. Auf der Challenge-Seite mit den Pfeilen zwischen den Runs wechseln. Nach dem Sieg läuft Run 5,
   der noch leer ist.

Eine zweite Demo, [`supabase/demo/demo_soulsilver.sql`](supabase/demo/demo_soulsilver.sql), zeigt den
Modus **alle verbunden**: Pokémon SoulSilver, alle vier Spieler in einem Soul-Link (stirbt eins, sterben
alle drei Partner mit). Run 1 endet an Biankas Miltank, Run 2 läuft noch und lässt sich direkt weiterspielen.

Erneutes Ausführen löscht die alte Demo und legt sie neu an. Spielernamen und Website-Adresse stehen
oben in der Datei. Loswerden: **Einstellungen → Challenge löschen** oder
`delete from public.challenges where slug = 'demo-platin-soullink';` (bzw. `'demo-soulsilver-alle'`).

---

## Notfall: Zugang der Leitung

Hat die Leitung kein verbundenes Gerät mehr, erzeugt dieses Snippet im Supabase-**SQL Editor** einen
neuen Link (Adresse der Challenge anpassen). Das Ergebnis an die Website-Adresse hängen:
`https://…/SoullinkWebsite/join#<ergebnis>`.

```sql
with t as (select 'inv_' || translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_') as token)
insert into public.challenge_invites (challenge_id, token_hash, role, member_id, max_uses, expires_at)
select m.challenge_id, sha256(convert_to(t.token, 'UTF8')), 'owner', m.id, 1, now() + interval '1 day'
from public.challenge_members m, t
where m.role = 'owner' and m.challenge_id = (select id from public.challenges where slug = 'platin-soullink')
returning (select token from t);
```

---

## Lokal entwickeln und testen

Voraussetzungen: Node.js 20+, Docker (für den lokalen Supabase-Stack), Python 3.10+.

```bash
npm install
npx supabase start          # lokaler Supabase-Stack, spielt alle Migrationen ein
cp .env.example .env.local  # API_URL und PUBLISHABLE_KEY aus der Ausgabe eintragen
npm run dev                 # http://localhost:5173
```

| Befehl | Zweck |
|---|---|
| `npm run build` | Typprüfung und Produktions-Build |
| `npm run lint` | oxlint |
| `npm run test:db` | Datenbank-Tests (braucht `DATABASE_URL` eines PostgreSQL ≥ 15, z. B. `postgres://postgres:postgres@localhost:5432/postgres`) |
| `npx supabase db reset` | lokale Datenbank neu aufsetzen (nach Änderungen an den Migrationen) |

Die Datenbank-Tests spielen eine Supabase-Attrappe, alle Migrationen und rund 100 Prüfungen in eine
Wegwerf-Datenbank: Row Level Security, Einladungen und Geräte, Unveränderlichkeit der Ereignisse,
Soul-Links (alle und paarweise), Undo-Regeln, Zähler über Runs hinweg, Bot-Zugang und den Import
eines Bot-Runs.

Stammdaten neu erzeugen (z. B. bei einer neuen Pokémon-Generation): `python3 tools/generate_species.py`.

---

## Aufbau des Repositorys

```
src/
  pages/                 Start, Einladung, Challenge
  components/challenge/  Routen-Board, Teams, Friedhof, Timeline, Zähler, Einstellungen, Dialoge
  components/            Sprite (animiert), Pokémon-Suche, Effekte (fx/), UI-Bausteine (ui/)
  hooks/, lib/           Datenzugriff, Live-Updates, Stammdaten, Router
supabase/
  migrations/            Schema, Views, Funktionen, RLS; Pokémon-Stammdaten
  tests/                 Supabase-Attrappe und Szenario-Tests
  demo/                  Demo-Challenges für den SQL Editor (Platin in Paaren, SoulSilver alle verbunden)
  config.toml            lokaler Supabase-Stack
tools/
  generate_species.py    Stammdaten aus PokeAPI
  generate_dex.py        Pokédex-Daten pro Edition (public/dex/) aus PokeAPI
  migration/             Import eines Bot-Runs (mit Testdaten im Bot-Format)
data/species.json        Stammdaten als JSON
public/dex/              Attacken, Werte, Typen, Entwicklungen pro Edition (generiert)
src/data/levelCaps.ts    Level-Caps pro Spiel (aus dem Discord-Bot)
scripts/test-db.sh       Datenbank-Tests
.github/workflows/       CI und Veröffentlichung auf GitHub Pages
docs/architektur.md      Architektur und Entscheidungen
```

Pokémon-Sprites und -Daten stammen von [PokeAPI](https://pokeapi.co). Pokémon ist eine Marke von
Nintendo, Creatures und GAME FREAK; dies ist ein privates Fanprojekt.
