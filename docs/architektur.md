# Architektur: Soul-Link-Plattform

Umgesetzt: Datenbankschema ([`supabase/migrations/`](../supabase/migrations/)), Pokémon-Stammdaten
([`tools/generate_species.py`](../tools/generate_species.py)), Import der Bot-Zähler
([`tools/migration/`](../tools/migration/)), Frontend ([`src/`](../src/)) und Tests.
Benutzung und Einrichtung: [`README.md`](../README.md). Offen: Bot auf die neue Datenbank umbauen,
danach die Sicherheitsphase (Threat Model, Header/CSP, CI-Scans, Pentest-Bericht).

## 1. Ausgangslage: was der Bot heute speichert

Pro Bot-Run ein Ordner `data/runs/<id>/` mit `meta.json` (Name, Spiel, Spieler, Status),
`routes.json` (pro Route die Entwicklungslinie jedes Spielers) und `stats.json`:

| Schlüssel | Inhalt |
|---|---|
| `deaths` / `alldeaths` | Tode pro Spieler, laufender Run („Session“) und gesamt |
| `missed_encounters` / `overall_missed_encounters` | verpasste Begegnungen, laufender Run und gesamt |
| `wipes` | Wipes pro Spieler |
| `resets` | Zahl abgeschlossener Runs |
| `dead_pokemon` | Namen toter Pokémon, ohne Spieler oder Route |
| `soul_links` | ungenutzt; Paare ergeben sich aus der Spielerreihenfolge (1↔2, 3↔4) |

Probleme, die das neue Modell direkt löst:

- Zähler und Daten können auseinanderlaufen (Tode werden gezählt, ohne dass klar ist, welches Pokémon starb).
- Tote Pokémon haben keinen Bezug zu Spieler, Route oder Soul-Link-Partnern.
- Die ältere Bot-Version suchte per Teilstring („Abra“ fand auch „Kadabra“) und fragte PokeAPI bei
  jedem Befehl live ab.
- `pokemonMapping.json` wird gebraucht, liegt aber nicht im Bot-Repo.

## 2. Domänenmodell

```
Challenge ──< Mitglied (Spieler / Zuschauer) ──< Gerät (anonyme Sitzung)
    │
    ├──< Route
    │
    └──< Ereignis (append-only, fortlaufend nummeriert, mit Run-Nummer)
             │
             └─ berechnet: Runs, Begegnungen, Soul-Links, Status, Friedhof, Zähler
```

- **Challenge**: die Gruppe mit ihren Spielern, Routen, Einladungen und dem Bot-Zugang, z. B.
  „Platin Randomizer mit Freunden“. Hat eine Adresse (`slug`) für die URL und ist öffentlich oder privat.
- **Run**: ein Durchgang von Start bis verloren (Wipe) oder gewonnen. Ein `run_ended`-Ereignis
  beendet ihn, danach beginnt der nächste. Die „Session“-Zähler des Bots sind die Zähler des
  laufenden Runs, „gesamt“ läuft über alle Runs. Runs sind keine eigene Tabelle: Jedes Ereignis
  trägt seine Run-Nummer, die laufende Nummer ist 1 + Anzahl der `run_ended`-Ereignisse.
- **Soul-Link**: Die Begegnungen einer Route im selben Run bilden pro Soul-Link-Gruppe einen Link
  (`link_id`). Gruppen kommen von den Spielern: alle gemeinsam (`link_group` leer) oder Paare wie im
  Bot (1↔2, 3↔4). Stirbt ein Pokémon, gelten die Partner im selben Link als `linked_dead`. Der Tod
  zählt nur beim Besitzer. Die Datenbank verhindert, dass Spieler verschiedener Gruppen in einem Link
  landen.
- **Begegnungsart**: `wild` (die normale Begegnung der Route) oder `static` (einmalige Begegnung
  durch Ansprechen, nach Sonderregel). Eine Static-Begegnung bildet einen eigenen Soul-Link auf
  derselben Route.

### Tabellen

| Tabelle | Zweck |
|---|---|
| `species` | 1025 Pokémon: Dex-Nr., englischer und deutscher Name, Generation, Entwicklungsreihe und -stufe, Sprite-URL |
| `challenges` | Challenge mit Sichtbarkeit, Bot-Einstellung und `last_seq` (Nummer des letzten Ereignisses) |
| `challenge_members` | Spieler und Zuschauer mit Name, Farbe, Sitzplatz, Soul-Link-Gruppe (`link_group`: Paare oder alle) und optionaler Discord-ID (für den Bot) |
| `member_devices` | Geräte eines Mitglieds: anonyme Supabase-Sitzung (`auth.users`) → Mitglied, pro Challenge eindeutig |
| `routes` | Routen pro Challenge (über alle Runs gleich), frei benennbar, sortierbar |
| `events` | **die eine Wahrheit**, siehe unten |
| `challenge_invites` | Einladungslinks (nur SHA-256-Hash gespeichert, Ablaufdatum, Nutzungslimit) |
| `bot_tokens` | Zugang des Bots, ein Token pro Challenge, nur als Hash gespeichert, widerrufbar |

### Ereignisse

| Typ | Payload | Wirkung |
|---|---|---|
| `encounter_logged` | `member_id`, `route_id`, `species_id`, `kind` (wild/static), `status` (team/box), `nickname?`, `link_id?`, `encounter_id?` | Pokémon gefangen. Ohne `link_id` tritt es dem jüngsten Soul-Link derselben Route und Art bei, in dem der Spieler noch fehlt |
| `encounter_missed` | `member_id`, `route_id?`, `note?` | verpasste Begegnung |
| `encounter_status_changed` | `encounter_id`, `status`, optional `slot` (1–6), optional `group_id` | Team ↔ Box, Platz im Team; höchstens sechs im Team, Teammitglied mit `slot` wechselt den Platz |
| `encounter_evolved` | `encounter_id`, `species_id` | nur innerhalb derselben Entwicklungsreihe |
| `encounter_corrected` | `encounter_id`, `species_id` | falsches Pokémon korrigiert: setzt gefangene und aktuelle Art (laufender Run) |
| `pokemon_died` | `encounter_id`, `route_id?` (Todesort), `cause?`, `opponent?`, `level?` | Tod; Partner werden `linked_dead` |
| `run_ended` | `result` (wipe/won), `caused_by_member_id?` (nur bei Wipe), `note?` | beendet den Run |
| `counter_adjusted` | `counter` (deaths/missed_encounters), `member_id`, `delta`, `note?` | Korrektur und Altdaten aus dem Bot |
| `event_reverted` | `event_id` | Undo |

Jedes Ereignis speichert zusätzlich: fortlaufende Nummer pro Challenge (`seq`), Run-Nummer, Quelle
(`web`/`bot`/`migration`), wer es ausgelöst hat, Zeitpunkt und optional eine `client_event_id`.

Die Team-Plätze sind keine eigene Spalte, sondern werden im Frontend aus den Ereignissen des Runs
nachgespielt (`src/lib/team.ts`): Fang ins Team → erster freier Platz, Wechsel ins Team → gewünschter
`slot`, Platzwechsel im Team → Tausch mit dem Inhaber, Box oder Tod → Platz frei. Tauschen mit der
Box sind zwei Ereignisse: erst `box`, dann `team` mit dem frei gewordenen Platz.

**Teams angleichen**: Die Website berechnet zu einem Teamwechsel die Wechsel der Soul-Link-Partner
(`mirror` in `src/lib/team.ts`; der Partner übernimmt den Platz, den sein ausgetauschter Partner frei
macht). `change_team` schreibt alle Wechsel einer Aktion in einer Transaktion mit gemeinsamer
`group_id` (ganz oder gar nicht, wiederholbar), `undo_team_change` macht sie gemeinsam rückgängig.
Ob angeglichen wird, steht in `challenges.team_sync`; die Datenbank erzwingt es bewusst nicht, damit
Sonderfälle („nur mein Team“) möglich bleiben.

Regeln, die die Datenbank erzwingt:

- **Unveränderlich**: Ein Trigger verbietet `UPDATE`/`DELETE` auf `events`, auch für den DB-Owner.
  Ausnahmen: Löschen zusammen mit der ganzen Challenge und das Anonymisieren der Urheber-Spalten,
  wenn eine Sitzung gelöscht wird.
- **Lückenlose Reihenfolge**: Beim Anhängen wird die Challenge-Zeile gesperrt; `seq` ist eindeutig
  und lückenlos. Damit erkennt der Client, ob er etwas verpasst hat.
- **Idempotenz**: Gleiche `client_event_id` → dasselbe Ereignis statt eines Duplikats
  (Doppelklick, Bot-Retry nach Timeout).
- **Payload-Validierung je Typ**: Pflichtfelder, Datentypen, Längen, Zugehörigkeit zur Challenge,
  bekannte Pokémon-Art, Pokémon lebt noch, gehört zum laufenden Run, Soul-Link passt zu Route,
  Art und Run. Unbekannte Felder werden verworfen.
- **Undo-Regeln**: Ein Ereignis nur einmal, Undo nicht rückgängig machbar, nur im laufenden Run.
  Eine Begegnung erst, wenn ihre Folgeereignisse (Tod, Entwicklung) zurückgenommen sind. Ein
  Run-Ende nur, solange im neuen Run noch nichts passiert ist.

### Projektionen (Views)

Alle mit `security_invoker = true`, damit beim Lesen die RLS der Basistabellen greift.

| View | Inhalt |
|---|---|
| `active_events` | Ereignisse, die zählen (weder Undo noch rückgängig gemacht) |
| `encounters` | Eine Zeile pro Pokémon: Art der Begegnung, gefangene und aktuelle Art, Spitzname, Zustand (`team`/`box`/`dead`/`linked_dead`), Todesort/-ursache, mit wem es gestorben ist |
| `challenge_stats` | laufender Run, abgeschlossene Runs, Wipes, Siege |
| `member_stats` | pro Spieler: Tode und verpasste Begegnungen (laufender Run/gesamt), verursachte Wipes |
| `graveyard` | selbst gestorbene Pokémon mit ihren Soul-Link-Partnern |

Die Timeline liest direkt `events` (inklusive Undos, damit sie durchgestrichen angezeigt werden können).

**Warum Views statt gespeicherter Projektionstabellen?** Es gibt keine zweite Kopie, die
auseinanderlaufen kann, und Änderungen an den Projektionen brauchen keine Datenmigration. Eine
Challenge hat realistisch einige hundert bis wenige tausend Ereignisse; das rechnet Postgres in
Millisekunden. Falls es doch langsam wird, lassen sich einzelne Views später per Trigger
materialisieren, ohne dass sich die API ändert.

## 3. Sicherheit

### Anmeldung ohne Konten

Es gibt keine Benutzerkonten und keine Passwörter. Öffnet jemand einen Einladungslink, legt die
Website eine **anonyme Supabase-Sitzung** an (`signInAnonymously`) und bindet sie per `join_challenge`
als Gerät an einen Platz (`member_devices`). Die Sitzung liegt im Browser; Rechte ergeben sich
ausschließlich aus dieser Bindung.

- Einladungslinks enthalten 256 Bit Zufall, in der Datenbank steht nur der SHA-256-Hash. Der Token
  steht im `#`-Teil der Adresse und wird deshalb nie an einen Server oder in Logs übertragen.
- Gerätelinks (an einen bestehenden Platz gebunden) sind einmal nutzbar und laufen ab. Die Leitung
  erstellt sie für jeden Platz, jedes Mitglied für sich selbst (zweites Gerät).
- Gerät verloren: Die Leitung meldet alle Geräte eines Platzes ab (`remove_member_devices`).
- `invite_preview` zeigt vor dem Beitritt, wohin ein Link führt, und antwortet bei ungültigen Links
  immer gleich (kein Orakel).

### Lesen: Row Level Security

| Wer | sieht |
|---|---|
| anonym ohne Sitzung (Zuschauerseite) | öffentliche Challenges mit Mitgliedern, Routen, Ereignissen, Views; Stammdaten |
| verbundenes Gerät | zusätzlich die privaten Challenges, mit denen es verbunden ist (auch als Zuschauer); eigene Gerätebindungen |
| Leitung (`owner`) | zusätzlich Einladungen, Bot-Tokens und Geräte der Challenge, aber nie Token-Hashes (Spaltenrechte) |

### Schreiben: nur über Funktionen

Clients haben auf keine Tabelle `INSERT`/`UPDATE`/`DELETE`-Rechte. Geschrieben wird über
RPC-Funktionen (`security definer`, `search_path = ''`), die Berechtigung und Payload prüfen. Alle
drei Schreibwege (Website, Bot, Migration) münden in derselben internen Funktion
`private.append_event`, d. h. die Validierung existiert genau einmal.

| RPC | wer |
|---|---|
| `create_challenge` | jedes Gerät mit Sitzung (wird `owner`) |
| `update_challenge`, `delete_challenge`, `add_player`, `revoke_invite`, `remove_member_devices`, `create_bot_token`, `revoke_bot_token` | Leitung |
| `create_invite` | Leitung; mit `p_member_id` des eigenen Platzes auch das Mitglied selbst (Gerätelink) |
| `append_event`, `create_route`, `update_route` | Spieler (`owner`/`player`) |
| `update_member` | das Mitglied selbst oder die Leitung |
| `join_challenge` | jedes Gerät mit Sitzung und gültigem Einladungstoken |
| `invite_preview` | alle (auch ohne Sitzung) |
| `bot_state`, `bot_create_route`, `bot_append_event` | nur mit gültigem Bot-Token (Rolle `anon`) |

Supabase vergibt in `public` standardmäßig alle Rechte an `anon`/`authenticated`, und PostgreSQL gibt
`EXECUTE` auf neue Funktionen an alle. Die Migration nimmt beides zuerst zurück, sodass jede
Freigabe explizit im Code steht. Interne Funktionen liegen im Schema `private`, das die API nicht
ausliefert.

Fehler werden als `PT4xx` geworfen; PostgREST macht daraus direkt den HTTP-Status (403, 404, 409 …).

### Bot-Zugang

Der Bot bekommt **nicht** den Service-Role-Key. Er nutzt den öffentlichen `anon`-Key plus ein
Challenge-Token (`slb_…`, 256 Bit Zufall), das die Leitung auf der Website erzeugt und jederzeit
widerrufen kann. Damit kann er genau drei Funktionen aufrufen und sieht nur seine Challenge.

- Der Bot übergibt die Discord-ID des Aufrufers. Hat ein Spieler diese ID auf der Website hinterlegt,
  wird das Ereignis ihm zugeschrieben.
- Unverknüpfte Discord-Nutzer dürfen schreiben (Standard, `bot_allow_unlinked = true`); ihre
  Discord-ID wird am Ereignis protokolliert. Die Leitung kann das pro Challenge abschalten.

Alternative, die ich bewusst nicht gewählt habe: eine eigene Postgres-Login-Rolle für den Bot mit
direkter DB-Verbindung. Das ist noch feinkörniger auf DB-Ebene, braucht aber ein DB-Passwort auf
dem Bot-Rechner, funktioniert nur über den Connection Pooler und ist nicht pro Challenge widerrufbar.

## 4. Bot-Befehle im neuen Modell

| Bot heute | neu |
|---|---|
| `/add` | `bot_create_route` + je Spieler `encounter_logged` mit gemeinsamer `link_id` (optional als Static) |
| `/lookup`, `/listall` | `encounters` gefiltert nach Route |
| `/whereis`, `/islogged` | `encounters` gefiltert nach Entwicklungsreihe (exakt statt Teilstring) |
| `/delete` | `event_reverted` für die Begegnungen der Route |
| `/deleteall`, `/resetdeaths`, `/resetmissedencounters`, `/resetresets`, `/addreset` | entfallen: Run-Zähler beginnen mit jedem neuen Run automatisch bei 0 |
| `/logdeath` | `pokemon_died` mit Bezug zur Begegnung; optional Ort und Ursache |
| `/adddeath` | `pokemon_died` (bevorzugt) oder `counter_adjusted` +1 |
| `/removedeath` | Undo |
| `/addmissedencounter` | `encounter_missed` |
| `/resetall` | `run_ended` mit `result = wipe` und Verursacher |
| neu: Sieg | `run_ended` mit `result = won` |
| `/deathcount`, `/missedencounters`, `/resets` | `member_stats`, `challenge_stats` |

Der Bot lädt `species` einmal beim Start (öffentlich lesbar) für die Autovervollständigung und
braucht weder `pokemonMapping.json` noch Live-Abfragen an PokeAPI.

## 5. Pokémon-Stammdaten

`tools/generate_species.py` lädt zwei CSV-Dateien aus dem PokeAPI-Repo (Arten und Namen) statt
über 1 000 API-Aufrufe, berechnet die Entwicklungsstufen und schreibt `data/species.json` sowie die
Migration `20261008120100_species.sql` (Upsert, kann also bei neuen Generationen einfach neu erzeugt
werden). Deutsche Namen sind die offiziellen aus PokeAPI (z. B. „Nidoran♀“); die Schreibweise des
Bots („nidoranf“) löst das Migrationsskript über `pokemonMapping.json` auf. Alle 1025 Einträge der
Mapping-Datei werden eindeutig zugeordnet.

## 6. Übernahme eines Bot-Runs

`tools/migration/migrate_bot_data.py` (nur Python-Standardbibliothek) liest einen Bot-Run-Ordner und
schreibt **nichts** in die Datenbank. Es erzeugt einen Bericht, eine SQL-Datei (Ausführung im
Supabase-SQL-Editor, eine Transaktion) und pro Spieler einen persönlichen Einladungslink. Die
SQL-Datei enthält nur die Hashes der Links.

1. Challenge aus `meta.json`, alle Spieler als freie Plätze in derselben Reihenfolge; `--owner` bekommt
   die Rolle Leitung und übernimmt sie, indem er als Erster seinen Link öffnet.
2. Soul-Link-Gruppen wie im Bot paarweise (Spieler 1↔2, 3↔4), wahlweise alle gemeinsam.
3. `resets` bzw. die Summe aus `wipes` ergibt die abgeschlossenen Runs (Wipes mit Verursacher). Was
   die Gesamtzähler über den laufenden Run hinaus zählen, wird als `counter_adjusted` im ersten Run
   verbucht.
4. `routes.json` wird der laufende Run: pro Route und Paar ein Soul-Link; gefangene Art = erste Stufe
   der gespeicherten Linie.
5. `dead_pokemon` wird wie im Bot über die Entwicklungslinie zugeordnet (mit Entwicklung auf die
   genannte Stufe). Der mitgestorbene Partner, den der Bot ebenfalls in die Liste schreibt, wird
   erkannt. Da der Bot die Liste bei `/resetall` nicht leert, landen Namen ohne Begegnung nur im Bericht.
6. Die Zähler des laufenden Runs, abzüglich der übernommenen Tode, als `counter_adjusted`: Alle Zähler
   pro Spieler entsprechen exakt dem Bot. Ein abgeschlossener Bot-Run (Hall of Fame) endet als Sieg.

Alle Ereignisse laufen über `private.append_event` mit Quelle `migration`, also durch dieselbe
Validierung wie neue Eingaben.

## 7. Tests

`scripts/test-db.sh` spielt eine Supabase-Attrappe (Rollen, `auth.uid()`, Realtime-Publikation),
alle Migrationen und die Tests in eine Wegwerf-Datenbank:

- `supabase/tests/schema.test.sql`: RLS (Fremde und Anonyme sehen keine privaten Challenges, direkte
  Tabellenzugriffe werden abgewiesen, Token-Hashes sind nicht lesbar), Einladungen, Unveränderlichkeit,
  Soul-Link-Tod, Static-Begegnungen, Undo-Regeln, Wipe und Sieg, Zähler über Runs hinweg, Bot-Zuordnung
  und strikter Modus, Geräte (zweites Gerät, Gerätelinks nur für den eigenen Platz, Abmelden),
  gelöschte Sitzung anonymisiert statt zu blockieren.
- `tools/migration/tests/run/`: ein Bot-Run im Originalformat (`meta.json`, `routes.json`,
  `stats.json`). Das erzeugte SQL wird eingespielt, Begegnungen, Tode, Paare und Zähler werden geprüft,
  und zwei Geräte treten mit den erzeugten Links bei.

In GitHub Actions laufen diese Tests bei jedem Pull Request (Postgres-Service-Container), dazu Lint,
Typprüfung und Build der Website.

```bash
DATABASE_URL=postgres://postgres@localhost:5432/postgres scripts/test-db.sh
```


## 8. Frontend

Stack und Animationsansatz wie im Portfolio (Vite, React 19, TypeScript, Tailwind CSS v4, shadcn/ui,
Motion, Lenis, oxlint), aber mit eigenem, hellem Erscheinungsbild: warmes Off-White, weiße Karten mit
weichen Schatten, Pokémon-Blau als Akzent, Gelb für Highlights, Rot nur für Tode; Schriften Bricolage
Grotesque, DM Sans und JetBrains Mono. Dazu `@supabase/supabase-js`. Gehostet auf GitHub Pages: Der
Basis-Pfad (`/SoullinkWebsite/`) kommt aus `VITE_BASE`, Unterseiten lädt die App über eine Kopie der
`index.html` als `404.html`. Kein Router-Paket: drei Seiten
(`/`, `/join`, `/c/<adresse>`) erledigt ein kleiner Router über die History-API (`src/lib/router.ts`).

| Seite / Bereich | Inhalt |
|---|---|
| Start | Hero mit Split-Reveal, Sprite-Laufband (Tempo folgt der Scroll-Geschwindigkeit), „Meine Challenges“ dieses Geräts, neue Challenge |
| Einladung | Vorschau (welche Challenge, welcher Platz), Beitritt ohne Konto |
| Routen | pro Route eine Zeile, Spieler als Spalten; Static-Begegnungen als eigene Zeile; je Soul-Link (alle oder Paar) ein Band, das schimmert, solange alle leben, und bei einem Tod reißt |
| Teams | Team und Box je Spieler; Wechsel fliegen animiert an den neuen Platz (Shared Layout) |
| Friedhof | Grabsteine mit Ursache, Gegner, Level, Ort und den mitgerissenen Partnern |
| Timeline | alle Ereignisse des Runs, Undo direkt am Eintrag, Undos durchgestrichen |
| Zähler | alle Bot-Zähler (Run/gesamt) mit hochzählenden Zahlen, verpasste Begegnung per Klick |
| Einstellungen | eigener Name, Farbe, Discord-ID, zweites Gerät; für die Leitung Mitglieder, Gerätelinks, Einladungen, Bot-Token, Löschen |

- **Sprites überall**: animierte Showdown-GIFs aus dem PokeAPI-Sprite-Repo (für 1011 der 1025 Arten),
  sonst das statische Sprite. Lebende Pokémon wippen versetzt, hüpfen beim Überfahren; tote sind grau.
- **Run-Archiv**: Über den Run-Umschalter lassen sich frühere Runs mit Board, Friedhof und Timeline ansehen.
- **Live**: Der Client abonniert `events`, `challenge_members`, `routes` und `challenges` gefiltert auf
  die Challenge (Realtime prüft RLS pro Abonnent) und lädt gebündelt neu. Nur die jüngste Anfrage darf
  den Zustand setzen, damit schnelle Wechsel keine veralteten Daten anzeigen.
- **Zuschauermodus**: Wer nicht Spieler ist (öffentliche Challenge oder Rolle Zuschauer), sieht alles
  ohne Schreibknöpfe.
- **Idempotenz im Client**: Der Begegnungsdialog vergibt `client_event_id`s einmal pro Öffnen; erneutes
  Absenden nach einem Netzwerkfehler erzeugt keine Duplikate.
- Alle Animationen respektieren „Bewegung reduzieren“.

Getestet wurde der komplette Ablauf mit Playwright gegen den lokalen Supabase-Stack (`supabase start`)
mit zwei Browsern: Challenge anlegen, Spieler einladen, Beitritt per Link, Begegnung mit Live-Update
beim zweiten Gerät, Static-Begegnung, Entwicklung, Tod mit Soul-Link, Undo, Run beenden, fremdes Gerät
ohne Zugriff, Paar-Modus (nur der Partner stirbt mit), Basis-Pfad wie auf GitHub Pages, Import mit
Übernahme der Leitung.
