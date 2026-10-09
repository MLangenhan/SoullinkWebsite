# Sicherheitskonzept

Wie die Plattform geschützt ist, gegen wen, und wie das automatisch geprüft wird. Die technischen
Details zu Rollen, RLS und RPCs stehen in [`architektur.md`](architektur.md#3-sicherheit).

## Was geschützt wird

| Schutzgut | Warum |
|---|---|
| Spielstände privater Challenges | Nur Mitspieler sollen sie sehen |
| Integrität des Ereignis-Logs | Ein manipulierter Tod oder Wipe verfälscht den ganzen Run |
| Einladungs-, Geräte- und Bot-Tokens | Wer sie hat, handelt im Namen eines Spielers |
| Sitzungen im Browser | Eine gestohlene Sitzung ist ein gestohlener Platz |
| Datenschutz der Besucher | Keine Tracker, keine Anfragen an Dritte ohne Grund |

## Angreifer

- **Fremde im Internet**: kennen die Adresse der Website, vielleicht die einer Challenge, haben aber keinen Link.
- **Zuschauer und Mitspieler**: sind verbunden, dürfen lesen bzw. spielen, sollen aber nicht mehr dürfen als ihre Rolle.
- **Wer einen Link abgreift**: z. B. aus einem weitergeleiteten Chat.
- **Lieferkette**: ein kompromittiertes npm-Paket oder eine kompromittierte GitHub Action.

## Bedrohungen und Maßnahmen (STRIDE)

| | Bedrohung | Maßnahme | Geprüft durch |
|---|---|---|---|
| **S**poofing | Sich als anderer Spieler ausgeben | Rechte hängen nur an der Gerätebindung (`member_devices`), nie an Angaben des Clients; Tokens mit 256 Bit Zufall | `schema.test.sql`, `security.test.sql` |
| | Fremden Bot-Token raten | 256 Bit Zufall, nur SHA-256 gespeichert, jederzeit widerrufbar, pro Challenge | `security.test.sql` |
| **T**ampering | Ereignisse direkt in die Tabelle schreiben oder ändern | Keine Schreibrechte auf Tabellen; ein Schreibweg (`private.append_event`) mit Validierung; Ereignisse unveränderlich, Undo nur als neues Ereignis | `security.test.sql` (Rechte), `schema.test.sql` (Unveränderlichkeit) |
| | SQL-Injection | Nur parametrisierte RPCs, kein dynamisches SQL mit Eingaben; `search_path = ''` in allen `SECURITY DEFINER`-Funktionen | `security.test.sql` |
| **R**epudiation | „Das war ich nicht“ | Jedes Ereignis trägt Gerät/Platz, Quelle (Website, Bot, Import) und ggf. Discord-ID | `schema.test.sql` (Bot-Zuordnung) |
| **I**nformation disclosure | Private Challenge lesen | Row Level Security auf allen Tabellen, Views mit `security_invoker` | `security.test.sql`, E2E „private Challenge unsichtbar“ |
| | Token-Hashes auslesen | Spaltenrechte: `token_hash` für Clients nicht lesbar | `security.test.sql` |
| | Links über Referrer oder Server-Logs | Token im `#`-Teil der Adresse (geht nie an Server), `referrer: no-referrer` | – |
| **D**enial of service | Riesige Eingaben | Längengrenzen per Check-Constraint und in der Validierung | `security.test.sql` |
| | Massenhaft anonyme Sitzungen | Rate Limits von Supabase Auth (Restrisiko, siehe unten) | – |
| **E**levation of privilege | Zuschauer schreibt, Spieler verwaltet | Rollenprüfung in jeder RPC; Erlaubnislisten, welche Funktionen `anon` und `authenticated` aufrufen dürfen | `security.test.sql`, `schema.test.sql` |
| | XSS stiehlt die Sitzung aus dem Browser | React escapt Ausgaben, kein `innerHTML`; Content Security Policy mit `script-src 'self'` und Trusted Types | E2E prüft die CSP und meldet jede Verletzung |

## Website

- **Content Security Policy** (als `<meta>`, weil GitHub Pages keine eigenen Header erlaubt, nur im
  Build): Skripte nur vom eigenen Ursprung, kein `eval`, keine Inline-Skripte, `require-trusted-types-for 'script'`,
  Verbindungen nur zur eigenen Seite und zum Supabase-Projekt, Bilder zusätzlich nur von
  `raw.githubusercontent.com` (Sprites), `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`.
  Definiert in [`vite.config.ts`](../vite.config.ts).
- **Keine Dritten**: Schriften liegen im eigenen Bundle (`@fontsource`) statt bei Google Fonts. Das LG
  München hat die Einbindung von Google Fonts 2022 als Datenschutzverstoß gewertet. Kein Tracking, keine Cookies.
- **Keine Quelltext-Maps** im Deploy.
- **Supabase-Schlüssel**: Im Frontend steht nur der öffentliche Publishable/anon-Key. Der Service-Role-Key
  wird nirgends benutzt, auch nicht vom Bot.

## Lieferkette und CI

| Maßnahme | Wo |
|---|---|
| Actions auf Commit-Hashes festgelegt statt auf verschiebbare Tags | alle Workflows |
| Minimale Rechte: `permissions: {}` auf Workflow-Ebene, pro Job nur das Nötige; `persist-credentials: false` | alle Workflows |
| `npm ci --ignore-scripts`: Pakete können beim Installieren keinen Code ausführen | CI, Deploy |
| `npm audit --audit-level=high` bricht den Build ab | CI |
| Dependency Review: neue Abhängigkeiten mit bekannten Lücken oder GPL/AGPL blockieren den PR | `dependency-review.yml` |
| CodeQL (`security-extended`) für TypeScript und für die Workflows | `codeql.yml` |
| zizmor prüft die Workflows auf Injection, zu breite Rechte, ungepinnte Actions | CI-Job `workflows` |
| Dependabot mit 7 Tagen Wartezeit: kompromittierte Releases fallen meist vorher auf | `dependabot.yml` |

## Tests

| Ebene | Was | Wo |
|---|---|---|
| Datenbank | Schema, RLS, RPCs, Event-Logik (rund 130 Prüfungen) | `supabase/tests/schema.test.sql` |
| Datenbank-Sicherheit | Rechte-Invarianten, Erlaubnislisten, Token-Speicherung, Angriffe von außen (31 Prüfungen) | `supabase/tests/security.test.sql` |
| Logik | Team-Plätze, Soul-Links, Gebiete, Routennamen, Level-Caps, Typen, Schadensrechner, Übersetzungen (Vitest, mit Mindestabdeckung) | `src/**/*.test.ts` |
| End-to-End | Produktions-Build mit CSP gegen echte lokale Supabase: Beitritt, alle Bereiche, Eintragen, Sprache, Einmal-Links, private Challenges, keine Dritten (Playwright) | `e2e/` |

Alles läuft bei jedem Pull Request in GitHub Actions; die Datenbank-Tests auf PostgreSQL 16 und 17.

## Restrisiken

- **Wer einen Link hat, kommt rein.** Gerätelinks sind einmal nutzbar und laufen ab; offene
  Einladungen begrenzt die Leitung über die Nutzungszahl. Verlorene Geräte meldet die Leitung ab.
- **Sitzung im `localStorage`**: Bei einer XSS-Lücke wäre sie lesbar. Gegenmaßnahmen sind CSP, Trusted Types
  und React; HttpOnly-Cookies bietet Supabase für reine Static Sites nicht.
- **Kein Clickjacking-Schutz über Header**: `frame-ancestors` wirkt nicht als `<meta>`, und GitHub Pages
  setzt keine eigenen Header. Folgenreiche Aktionen (Challenge löschen) verlangen deshalb eine Eingabe.
- **Anonyme Sitzungen** lassen sich in großer Zahl anlegen; Supabase begrenzt die Rate. Bei Missbrauch
  ließe sich ein CAPTCHA (Cloudflare Turnstile) in Supabase Auth zuschalten.
- **Öffentliche Challenges** sind absichtlich für alle lesbar.
