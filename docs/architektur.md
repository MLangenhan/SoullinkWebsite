# Architektur: Soul-Link-Plattform

Stand: Entwurf zur Besprechung. Umgesetzt ist bisher nur das Datenbankschema
([`supabase/migrations/20261008120000_init.sql`](../supabase/migrations/20261008120000_init.sql))
samt Szenario-Tests ([`supabase/tests/schema.test.sql`](../supabase/tests/schema.test.sql)).

## 1. Ausgangslage: was der Bot heute speichert

`data.json` (Routen):

```json
{
  "Route 201": [
    "Moritz: Pichu, Pikachu, Raichu\nJanne: Abra, Kadabra, Simsala\nElsmann: …\nLinus: …"
  ]
}
```

Pro Route eine Liste von Einträgen, jeder Eintrag ein mehrzeiliger String mit der kompletten
Entwicklungslinie pro Spieler. Welches Pokémon tatsächlich gefangen wurde, steht nirgends.

`deaths.json` (alles andere):

| Schlüssel | Inhalt |
|---|---|
| `dead` | Liste von Pokémon-Namen, ohne Bezug zu Route oder Spieler |
| `deaths` / `alldeaths` | Tode pro Spieler, „Session“ und gesamt |
| `missed_encounters` / `overall_missed_encounters` | verpasste Begegnungen, „dieser Versuch“ und gesamt |
| `resets` | Zahl |
| `whipes` | Wipes pro Spieler (Schreibweise wie im Code) |

Probleme, die das neue Modell direkt löst:

- `/whereis` und `/islogged` suchen per Teilstring: „Abra“ findet auch „Kadabra“.
- Zähler und Daten können auseinanderlaufen (`/adddeath` ist unabhängig von `/logdeath`).
- `/resetall` erhöht `resets` nur, wenn der Schlüssel schon existiert; `/removedeath` läuft nach
  einem Fehler weiter.
- `pokemonMapping.json` wird geladen, liegt aber nicht im Repo (`mapping.py` erzeugt nur eine
  Namensliste). Ohne diese Datei startet der Bot nicht.
- Jede Abfrage ruft PokeAPI live auf (bei `/add` bis zu 16 Requests).

## 2. Domänenmodell

```
Run ──< Mitglied (Spieler / Zuschauer, evtl. Platzhalter ohne Konto)
 │
 ├──< Route
 │
 └──< Ereignis (append-only, fortlaufend nummeriert)
          │
          └─ berechnet: Begegnungen, Soul-Links, Status, Friedhof, Zähler, Versuche
```

- **Run**: eine Challenge, z. B. „Platin Randomizer mit Freunden“. Hat eine Adresse (`slug`) für
  die URL und ist öffentlich oder privat.
- **Versuch** (`attempt`): Ein Run besteht aus Versuchen. Ein Wipe oder Reset beendet den laufenden
  Versuch, danach beginnt der nächste. „Session“-Zähler des Bots = Zähler des laufenden Versuchs,
  „gesamt“ = über alle Versuche. Versuche sind keine eigene Tabelle, sondern ergeben sich aus den
  `attempt_ended`-Ereignissen; jedes Ereignis trägt seine Versuchsnummer.
- **Soul-Link**: Begegnungen derselben Route im selben Versuch bilden eine Gruppe (`link_id`).
  Stirbt ein Pokémon, gelten alle Partner der Gruppe als `linked_dead`.

### Tabellen

| Tabelle | Zweck |
|---|---|
| `profiles` | 1:1 zu `auth.users`, wird beim ersten Discord-Login per Trigger angelegt (Discord-ID, Name, Avatar) |
| `species` | Pokémon-Stammdaten: Dex-Nr., englischer und deutscher Name, Entwicklungsreihe, Stufe, Sprite-URL |
| `runs` | Run mit Sichtbarkeit, Bot-Einstellung und `last_seq` (Nummer des letzten Ereignisses) |
| `run_members` | Spieler und Zuschauer. `user_id` leer = Platzhalter (z. B. migrierte Spieler), wird per Einladung übernommen |
| `routes` | Routen pro Run, frei benennbar, sortierbar |
| `events` | **die eine Wahrheit**, siehe unten |
| `run_invites` | Einladungslinks (nur SHA-256-Hash gespeichert, Ablaufdatum, Nutzungslimit) |
| `bot_tokens` | Zugang des Bots, ein Token pro Run, nur als Hash gespeichert, widerrufbar |

### Ereignisse

| Typ | Payload | Wirkung |
|---|---|---|
| `encounter_logged` | `member_id`, `route_id`, `species_id`, `status` (team/box), `nickname?`, `link_id?`, `encounter_id?` | Pokémon gefangen. Ohne `link_id` tritt es dem jüngsten Soul-Link der Route bei, in dem der Spieler noch fehlt |
| `encounter_missed` | `member_id`, `route_id?`, `note?` | verpasste Begegnung |
| `encounter_status_changed` | `encounter_id`, `status` | Team ↔ Box |
| `encounter_evolved` | `encounter_id`, `species_id` | nur innerhalb derselben Entwicklungsreihe |
| `pokemon_died` | `encounter_id`, `route_id?` (Todesort), `cause?`, `opponent?`, `level?` | Tod; Partner werden `linked_dead` |
| `attempt_ended` | `reason` (wipe/reset), `caused_by_member_id?`, `note?` | beendet den Versuch |
| `counter_adjusted` | `counter` (deaths/missed_encounters), `member_id`, `delta`, `note?` | Korrektur und Altdaten aus dem Bot |
| `event_reverted` | `event_id` | Undo |

Jedes Ereignis speichert zusätzlich: fortlaufende Nummer pro Run (`seq`), Versuch, Quelle
(`web`/`bot`/`migration`), wer es ausgelöst hat, Zeitpunkt und optional eine `client_event_id`.

Regeln, die die Datenbank erzwingt:

- **Unveränderlich**: Ein Trigger verbietet `UPDATE`/`DELETE` auf `events`, auch für den DB-Owner.
  Ausnahmen: Löschen zusammen mit dem ganzen Run und das Anonymisieren der Urheber-Spalten, wenn
  ein Konto gelöscht wird.
- **Lückenlose Reihenfolge**: Beim Anhängen wird die Run-Zeile gesperrt; `seq` ist pro Run eindeutig
  und lückenlos. Damit kann der Client erkennen, ob er etwas verpasst hat.
- **Idempotenz**: Gleiche `client_event_id` → dasselbe Ereignis statt eines Duplikats
  (Doppelklick, Bot-Retry nach Timeout).
- **Payload-Validierung je Typ**: Pflichtfelder, Datentypen, Längen, Zugehörigkeit zu Run/Route,
  bekannte Pokémon-Art, Pokémon lebt noch, gehört zum laufenden Versuch. Unbekannte Felder werden
  verworfen.
- **Undo-Regeln**: Ein Ereignis nur einmal, Undo nicht rückgängig machbar, nur im laufenden
  Versuch. Eine Begegnung erst, wenn ihre Folgeereignisse (Tod, Entwicklung) zurückgenommen sind.
  Ein Wipe nur, solange im neuen Versuch noch nichts passiert ist.

### Projektionen (Views)

Alle mit `security_invoker = true`, damit beim Lesen die RLS der Basistabellen greift.

| View | Inhalt |
|---|---|
| `active_events` | Ereignisse, die zählen (weder Undo noch rückgängig gemacht) |
| `encounters` | Eine Zeile pro Pokémon: gefangene und aktuelle Art, Spitzname, Zustand (`team`/`box`/`dead`/`linked_dead`), Todesort/-ursache, mit wem es gestorben ist |
| `run_stats` | laufender Versuch, Resets gesamt, Wipes gesamt |
| `member_stats` | pro Spieler: Tode und verpasste Begegnungen (Versuch/gesamt), verursachte Wipes |
| `graveyard` | gestorbene Pokémon mit ihren Soul-Link-Partnern |

Die Timeline liest direkt `events` (inklusive Undos, damit sie durchgestrichen angezeigt werden können).

**Warum Views statt gespeicherter Projektionstabellen?** Es gibt keine zweite Kopie, die
auseinanderlaufen kann, und Schemaänderungen an den Projektionen brauchen keine Datenmigration.
Ein Run hat realistisch einige hundert bis wenige tausend Ereignisse; das rechnet Postgres in
Millisekunden. Falls es doch langsam wird, lassen sich einzelne Views später per Trigger
materialisieren, ohne dass sich die API ändert.

## 3. Sicherheit

### Lesen: Row Level Security

| Wer | sieht |
|---|---|
| anonym (Zuschauerseite) | öffentliche Runs mit Mitgliedern, Routen, Ereignissen, Views; Stammdaten |
| angemeldet | zusätzlich private Runs, in denen er Mitglied ist (auch als Zuschauer); eigenes Profil |
| Run-Leitung (`owner`) | zusätzlich Einladungen und Bot-Tokens des Runs, aber nie deren Hashes (Spaltenrechte) |

### Schreiben: nur über Funktionen

Clients haben auf keine Tabelle `INSERT`/`UPDATE`/`DELETE`-Rechte. Geschrieben wird über
RPC-Funktionen (`security definer`, `search_path = ''`), die Berechtigung und Payload prüfen. Alle
drei Schreibwege (Website, Bot, Migration) münden in derselben internen Funktion
`private.append_event`, d. h. die Validierung existiert genau einmal.

| RPC | wer |
|---|---|
| `create_run` | jeder Angemeldete (wird `owner`) |
| `update_run`, `delete_run`, `add_player`, `create_invite`, `revoke_invite`, `create_bot_token`, `revoke_bot_token` | Run-Leitung |
| `append_event`, `create_route`, `update_route` | Spieler (`owner`/`player`) |
| `update_member` | das Mitglied selbst oder die Run-Leitung |
| `join_run` | jeder Angemeldete mit gültigem Einladungstoken |
| `bot_state`, `bot_create_route`, `bot_append_event` | nur mit gültigem Bot-Token (Rolle `anon`) |

Supabase vergibt in `public` standardmäßig alle Rechte an `anon`/`authenticated`, und PostgreSQL gibt
`EXECUTE` auf neue Funktionen an alle. Die Migration dreht beides zuerst ab, sodass jede Freigabe
explizit im Code steht. Interne Funktionen liegen im Schema `private`, das die API nicht ausliefert.

Fehler werden als `PT4xx` geworfen; PostgREST macht daraus direkt den HTTP-Status (403, 404, 409 …).

### Bot-Zugang

Der Bot bekommt **nicht** den Service-Role-Key. Er nutzt den öffentlichen `anon`-Key plus ein
Run-Token (`slb_…`, 256 Bit Zufall), das die Run-Leitung auf der Website erzeugt und jederzeit
widerrufen kann. Damit kann er genau drei Funktionen aufrufen und sieht nur seinen Run.

- Der Bot übergibt die Discord-ID des Aufrufers. Ist sie mit einem Spieler verknüpft (der Spieler hat
  sich einmal per Discord auf der Website angemeldet), wird das Ereignis ihm zugeschrieben.
- Unverknüpfte Discord-Nutzer: je nach Run-Einstellung `bot_allow_unlinked` erlaubt (mit
  protokollierter Discord-ID) oder abgelehnt. Für die Übergangszeit ist das erlaubt; danach würde
  ich auf „strikt“ stellen.

Alternative, die ich bewusst nicht gewählt habe: eine eigene Postgres-Login-Rolle für den Bot mit
direkter DB-Verbindung. Das ist noch feinkörniger auf DB-Ebene, braucht aber ein DB-Passwort auf
dem Bot-Rechner, funktioniert nur über den Connection Pooler und ist nicht pro Run widerrufbar.

### Getestet

`scripts/test-db.sh` spielt eine Supabase-Attrappe (Rollen, `auth.uid()`, Realtime-Publikation), die
Migration und `supabase/tests/schema.test.sql` in eine Wegwerf-Datenbank. Die 63 Prüfungen decken
u. a. ab: Fremde und Anonyme sehen keine privaten Runs, direkte Tabellenzugriffe werden abgewiesen,
Einladungen sind einmalig, Token-Hashes sind nicht lesbar, Ereignisse sind auch für den DB-Owner
unveränderlich, Soul-Link-Tod, Undo-Regeln, Zähler über Versuche hinweg, Bot-Zuordnung und
strikter Modus, Kontolöschung anonymisiert statt zu blockieren.

```bash
DATABASE_URL=postgres://postgres@localhost:5432/postgres scripts/test-db.sh
```

Später als CI-Job (Postgres-Service-Container in GitHub Actions).

## 4. Bot-Befehle im neuen Modell

| Bot heute | neu |
|---|---|
| `/add` | `bot_create_route` + je Spieler `encounter_logged` mit gemeinsamer `link_id` |
| `/lookup`, `/listall` | `encounters` gefiltert nach Route |
| `/whereis`, `/islogged` | `encounters` gefiltert nach Entwicklungsreihe (exakt statt Teilstring) |
| `/delete` | `event_reverted` für die Begegnungen der Route |
| `/deleteall` | entfällt (neuer Versuch über `attempt_ended`) |
| `/logdeath` | `pokemon_died` mit Bezug zur Begegnung; optional Ort und Ursache |
| `/adddeath` | `pokemon_died` (bevorzugt) oder `counter_adjusted` +1 |
| `/removedeath` | Undo |
| `/addmissedencounter` | `encounter_missed` |
| `/resetall` | `attempt_ended` mit `reason = wipe` und Verursacher |
| `/addreset` | `attempt_ended` mit `reason = reset` |
| `/deathcount`, `/missedencounters`, `/resets` | `member_stats`, `run_stats` |
| `/resetdeaths`, `/resetmissedencounters`, `/resetresets` | siehe offene Frage 2 |

Der Bot lädt `species` einmal beim Start (öffentlich lesbar, ca. 1 000 Zeilen) für die Autovervollständigung
und braucht weder `pokemonMapping.json` noch Live-Abfragen an PokeAPI.

## 5. Migration der Altdaten (nächster Schritt)

Skizze, wird nach Klärung der Fragen umgesetzt:

1. Run mit vier Platzhalter-Spielern (Moritz, Janne, Elsmann, Linus) anlegen.
2. `data.json`: Pro Route und Eintrag die Zeilen `Name: A, B, C` parsen. Die Namen gegen
   `species.name_de`/`name_en` auflösen; die gefangene Art ist die erste Stufe der Linie (der Bot hat
   nur die Linie gespeichert). Pro Eintrag ein Soul-Link mit vier `encounter_logged`.
3. `deaths.json` → `dead`: Namen über die Entwicklungsreihe der Begegnungen zuordnen und als
   `pokemon_died` anlegen. Nicht eindeutige oder unbekannte Namen landen in einem Bericht.
4. Zähler: `resets` und `whipes` werden zu historischen `attempt_ended`-Ereignissen; die Differenz
   zwischen den gespeicherten Zählern und dem, was die Ereignisse ergeben, wird als
   `counter_adjusted` (Notiz „Altdaten Bot“) im passenden Versuch ergänzt, damit alle Zahlen exakt
   stimmen.
5. Erst Trockenlauf mit Bericht, dann Import in einer Transaktion. Der Import läuft einmalig lokal
   mit DB-Zugang über `private.append_event` mit Quelle `migration`.

## 6. Frontend (Schritt 4)

Stack wie im Portfolio: Vite, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Motion, Lenis,
oxlint, Deployment auf Vercel. Dazu kommen `@supabase/supabase-js` und ein Router. Animationsansatz
übernommen: Split-Reveal-Überschriften, hochzählende Zähler, Vorhang-Übergänge, `prefers-reduced-motion`
überall. Neu dazu, passend zum Thema: Begegnungskarten, die bei Live-Updates einfliegen, ein
Soul-Link-Band, das bei einem Tod für alle Partner gleichzeitig reißt, und ein Friedhof mit
gestaffeltem Einblenden.

Live-Updates: Der Client abonniert `events` gefiltert auf den Run (Realtime prüft RLS pro
Abonnent) und lädt bei jedem neuen Ereignis die Views nach. Über `seq` merkt er, ob er nach einem
Verbindungsabbruch etwas verpasst hat.

## 7. Offene Fragen

1. **Wer bekommt den Tod?** Entwurf: Nur der Besitzer des gestorbenen Pokémon bekommt +1, die
   Partner werden als „mitgestorben“ angezeigt, zählen aber nicht. Oder sollen alle Partner +1 bekommen?
2. **Was war „Session“ im Bot?** Bei verpassten Begegnungen schreibt der Bot „this attempt“, bei Toden
   „session“, und `/resetdeaths` setzt die Tode ohne Wipe zurück. Entwurf: Session = Versuch, und die
   separaten Reset-Befehle entfallen. Falls ihr „Session“ als Spielabend genutzt habt, bräuchte es
   einen eigenen Ereignistyp `session_started`.
3. **Reset vs. Wipe:** `/addreset` zählt einen Reset ohne Wipe. Wofür habt ihr das benutzt? Entwurf:
   beides beendet den Versuch, nur ein Wipe hat einen Verursacher.
4. **Mehrere Einträge pro Route:** `data.json` erlaubt mehrere Einträge pro Route. Kam das vor (z. B.
   Geschenk-Pokémon), und soll das ein zweiter Soul-Link auf derselben Route sein? Das Schema kann das.
5. **Bot und unverknüpfte Discord-Nutzer:** Übergangsweise erlauben und später auf strikt stellen?
6. **Altdaten:** `data.json` und `deaths.json` liegen nur lokal. Für das Migrationsskript bräuchte ich
   sie (oder einen anonymisierten Auszug), um den Parser an echten Daten zu testen.
