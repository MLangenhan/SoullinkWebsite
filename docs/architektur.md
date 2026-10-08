# Architektur: Soul-Link-Plattform

Umgesetzt: Datenbankschema ([`supabase/migrations/`](../supabase/migrations/)), Pokémon-Stammdaten
([`tools/generate_species.py`](../tools/generate_species.py)), Import der Bot-Altdaten
([`tools/migration/`](../tools/migration/)) und Tests für alles davon. Als Nächstes: das Frontend.

## 1. Ausgangslage: was der Bot heute speichert

`data.json` (Routen des laufenden Runs, wird bei `/resetall` geleert):

```json
{
  "Route 201": [
    "Moritz: Pichu, Pikachu, Raichu\nJanne: Abra, Kadabra, Simsala\nElsmann: …\nLinus: …"
  ]
}
```

Pro Route eine Liste von Einträgen (mehrere bei Static-Begegnungen), jeder Eintrag ein
mehrzeiliger String mit der kompletten Entwicklungslinie pro Spieler. Welches Pokémon tatsächlich
gefangen wurde, steht nirgends.

`deaths.json` (alles andere):

| Schlüssel | Inhalt |
|---|---|
| `dead` | Liste von Pokémon-Namen ohne Bezug zu Route oder Spieler; wird nie geleert |
| `deaths` / `alldeaths` | Tode pro Spieler, laufender Run („Session“) und gesamt |
| `missed_encounters` / `overall_missed_encounters` | verpasste Begegnungen, laufender Run und gesamt |
| `resets` | Zahl abgeschlossener Runs |
| `whipes` | Wipes pro Spieler (Schreibweise wie im Code, Spielername nicht normalisiert) |

Probleme, die das neue Modell direkt löst:

- `/whereis` und `/islogged` suchen per Teilstring: „Abra“ findet auch „Kadabra“.
- Zähler und Daten können auseinanderlaufen (`/adddeath` ist unabhängig von `/logdeath`).
- `/resetall` erhöht `resets` nur, wenn der Schlüssel schon existiert; `/removedeath` läuft nach
  einem Fehler weiter.
- `pokemonMapping.json` wird gebraucht, liegt aber nicht im Bot-Repo.
- Jede Abfrage ruft PokeAPI live auf (bei `/add` bis zu 16 Requests).

## 2. Domänenmodell

```
Challenge ──< Mitglied (Spieler / Zuschauer, evtl. Platzhalter ohne Konto)
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
- **Soul-Link**: Die Begegnungen einer Route im selben Run bilden eine Gruppe (`link_id`). Stirbt
  ein Pokémon, gelten alle Partner der Gruppe als `linked_dead`. Der Tod zählt nur beim Besitzer.
- **Begegnungsart**: `wild` (die normale Begegnung der Route) oder `static` (einmalige Begegnung
  durch Ansprechen, nach Sonderregel). Eine Static-Begegnung bildet einen eigenen Soul-Link auf
  derselben Route.

### Tabellen

| Tabelle | Zweck |
|---|---|
| `profiles` | 1:1 zu `auth.users`, wird beim ersten Discord-Login per Trigger angelegt (Discord-ID, Name, Avatar) |
| `species` | 1025 Pokémon: Dex-Nr., englischer und deutscher Name, Generation, Entwicklungsreihe und -stufe, Sprite-URL |
| `challenges` | Challenge mit Sichtbarkeit, Bot-Einstellung und `last_seq` (Nummer des letzten Ereignisses) |
| `challenge_members` | Spieler und Zuschauer. `user_id` leer = Platzhalter (z. B. migrierte Spieler), wird per Einladung übernommen |
| `routes` | Routen pro Challenge (über alle Runs gleich), frei benennbar, sortierbar |
| `events` | **die eine Wahrheit**, siehe unten |
| `challenge_invites` | Einladungslinks (nur SHA-256-Hash gespeichert, Ablaufdatum, Nutzungslimit) |
| `bot_tokens` | Zugang des Bots, ein Token pro Challenge, nur als Hash gespeichert, widerrufbar |

### Ereignisse

| Typ | Payload | Wirkung |
|---|---|---|
| `encounter_logged` | `member_id`, `route_id`, `species_id`, `kind` (wild/static), `status` (team/box), `nickname?`, `link_id?`, `encounter_id?` | Pokémon gefangen. Ohne `link_id` tritt es dem jüngsten Soul-Link derselben Route und Art bei, in dem der Spieler noch fehlt |
| `encounter_missed` | `member_id`, `route_id?`, `note?` | verpasste Begegnung |
| `encounter_status_changed` | `encounter_id`, `status` | Team ↔ Box |
| `encounter_evolved` | `encounter_id`, `species_id` | nur innerhalb derselben Entwicklungsreihe |
| `pokemon_died` | `encounter_id`, `route_id?` (Todesort), `cause?`, `opponent?`, `level?` | Tod; Partner werden `linked_dead` |
| `run_ended` | `result` (wipe/won), `caused_by_member_id?` (nur bei Wipe), `note?` | beendet den Run |
| `counter_adjusted` | `counter` (deaths/missed_encounters), `member_id`, `delta`, `note?` | Korrektur und Altdaten aus dem Bot |
| `event_reverted` | `event_id` | Undo |

Jedes Ereignis speichert zusätzlich: fortlaufende Nummer pro Challenge (`seq`), Run-Nummer, Quelle
(`web`/`bot`/`migration`), wer es ausgelöst hat, Zeitpunkt und optional eine `client_event_id`.

Regeln, die die Datenbank erzwingt:

- **Unveränderlich**: Ein Trigger verbietet `UPDATE`/`DELETE` auf `events`, auch für den DB-Owner.
  Ausnahmen: Löschen zusammen mit der ganzen Challenge und das Anonymisieren der Urheber-Spalten,
  wenn ein Konto gelöscht wird.
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

### Lesen: Row Level Security

| Wer | sieht |
|---|---|
| anonym (Zuschauerseite) | öffentliche Challenges mit Mitgliedern, Routen, Ereignissen, Views; Stammdaten |
| angemeldet | zusätzlich private Challenges, in denen er Mitglied ist (auch als Zuschauer); eigenes Profil |
| Leitung (`owner`) | zusätzlich Einladungen und Bot-Tokens der Challenge, aber nie deren Hashes (Spaltenrechte) |

### Schreiben: nur über Funktionen

Clients haben auf keine Tabelle `INSERT`/`UPDATE`/`DELETE`-Rechte. Geschrieben wird über
RPC-Funktionen (`security definer`, `search_path = ''`), die Berechtigung und Payload prüfen. Alle
drei Schreibwege (Website, Bot, Migration) münden in derselben internen Funktion
`private.append_event`, d. h. die Validierung existiert genau einmal.

| RPC | wer |
|---|---|
| `create_challenge` | jeder Angemeldete (wird `owner`) |
| `update_challenge`, `delete_challenge`, `add_player`, `create_invite`, `revoke_invite`, `create_bot_token`, `revoke_bot_token` | Leitung |
| `append_event`, `create_route`, `update_route` | Spieler (`owner`/`player`) |
| `update_member` | das Mitglied selbst oder die Leitung |
| `join_challenge` | jeder Angemeldete mit gültigem Einladungstoken |
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

- Der Bot übergibt die Discord-ID des Aufrufers. Ist sie mit einem Spieler verknüpft (der Spieler hat
  sich einmal per Discord auf der Website angemeldet), wird das Ereignis ihm zugeschrieben.
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

## 6. Migration der Altdaten

`tools/migration/migrate_bot_data.py` (nur Python-Standardbibliothek) liest `data.json` und
`deaths.json` und schreibt **nichts** in die Datenbank. Es erzeugt einen Bericht und eine SQL-Datei,
die erst nach Prüfung ausgeführt wird (Supabase-SQL-Editor oder `psql`), komplett in einer
Transaktion.

Abbildung:

1. Challenge mit allen Spielern anlegen. Die Leitung (`--owner`, braucht ein Profil, also einmal per
   Discord anmelden) bekommt ihr Konto, alle anderen werden Platzhalter und übernehmen ihren Platz
   per Einladungslink.
2. `resets` bzw. die Summe aus `whipes` ergibt die abgeschlossenen Runs, jeweils als Wipe mit
   Verursacher. Was `alldeaths` und `overall_missed_encounters` über den laufenden Run hinaus zählen,
   wird als `counter_adjusted` („Altdaten Bot: Summe aller früheren Runs“) im ersten Run verbucht.
3. `data.json` wird der laufende Run: pro Route ist der erste Eintrag die wilde Begegnung, weitere
   Einträge sind Static-Begegnungen, jeder Eintrag ein Soul-Link. Gefangene Art = erste Stufe der
   gespeicherten Linie.
4. `dead` wird über die Entwicklungsreihe einer Begegnung im laufenden Run zugeordnet (bei Bedarf mit
   Entwicklung auf die Stufe, mit der das Pokémon starb). Mehrdeutige Namen lassen sich mit
   `--assign NAME=SPIELER` auflösen; Namen ohne passende Begegnung stammen aus früheren Runs und
   werden nur berichtet; Tode von Partnern eines schon toten Soul-Links zählen als mitgestorben.
5. Was die Ereignisse bei `deaths`/`missed_encounters` nicht erklären, wird im laufenden Run als
   `counter_adjusted` („Altdaten Bot“) ergänzt. Ergebnis: Alle Zähler pro Spieler entsprechen exakt
   dem Bot.

Alle Ereignisse laufen über `private.append_event` mit Quelle `migration`, also durch dieselbe
Validierung wie neue Eingaben.

```bash
python3 tools/migration/migrate_bot_data.py --data data.json --deaths deaths.json \
  --name "Platin Soul Link" --slug platin-soullink \
  --owner Moritz --owner-discord-id <deine Discord-ID>
# Bericht prüfen, dann migration.sql im Supabase-SQL-Editor ausführen
```

## 7. Tests

`scripts/test-db.sh` spielt eine Supabase-Attrappe (Rollen, `auth.uid()`, Realtime-Publikation),
alle Migrationen und die Tests in eine Wegwerf-Datenbank:

- `supabase/tests/schema.test.sql`: RLS (Fremde und Anonyme sehen keine privaten Challenges, direkte
  Tabellenzugriffe werden abgewiesen, Token-Hashes sind nicht lesbar), Einladungen, Unveränderlichkeit,
  Soul-Link-Tod, Static-Begegnungen, Undo-Regeln, Wipe und Sieg, Zähler über Runs hinweg, Bot-Zuordnung
  und strikter Modus, Kontolöschung anonymisiert statt zu blockieren.
- `tools/migration/tests/`: Testdaten im Bot-Format mit allen Sonderfällen (Static-Eintrag, Evoli mit
  verzweigter Linie, „Typ:Null“, leere Zeile, unbekannter Name, mehrdeutiger Tod, Partner-Tod,
  kleingeschriebener Name in `whipes`). Das erzeugte SQL wird eingespielt und die Zähler werden gegen
  `deaths.json` geprüft.

```bash
DATABASE_URL=postgres://postgres@localhost:5432/postgres scripts/test-db.sh
```

Später als CI-Job (Postgres-Service-Container in GitHub Actions).

## 8. Frontend (nächster Schritt)

Stack wie im Portfolio: Vite, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Motion, Lenis,
oxlint, Deployment auf Vercel. Dazu kommen `@supabase/supabase-js` und ein Router. Animationsansatz
übernommen: Split-Reveal-Überschriften, hochzählende Zähler, Vorhang-Übergänge, `prefers-reduced-motion`
überall. Neu dazu, passend zum Thema: Begegnungskarten, die bei Live-Updates einfliegen, ein
Soul-Link-Band, das bei einem Tod für alle Partner gleichzeitig reißt, und ein Friedhof mit
gestaffeltem Einblenden.

Live-Updates: Der Client abonniert `events` gefiltert auf die Challenge (Realtime prüft RLS pro
Abonnent) und lädt bei jedem neuen Ereignis die Views nach. Über `seq` merkt er, ob er nach einem
Verbindungsabbruch etwas verpasst hat.
