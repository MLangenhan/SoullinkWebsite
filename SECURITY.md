# Sicherheit

## Lücke melden

Bitte **kein öffentliches Issue**. Nutze stattdessen
[„Report a vulnerability“](https://github.com/MLangenhan/SoullinkWebsite/security/advisories/new)
(GitHub Private Vulnerability Reporting). Hilfreich sind:

- was betroffen ist (Website, Datenbankfunktion, Bot-Schnittstelle),
- Schritte zum Nachstellen, am besten gegen eine lokale Instanz (`npx supabase start`),
- was ein Angreifer damit erreichen könnte.

Ich melde mich innerhalb einer Woche. Das ist ein privates Hobbyprojekt ohne Bug-Bounty, über Hinweise
freue ich mich trotzdem sehr und nenne dich auf Wunsch im Fix.

## Bitte nicht

- Tests gegen fremde Challenges oder die öffentliche Supabase-Instanz, die über Lesen öffentlicher
  Daten hinausgehen
- Massenhaft Sitzungen, Einladungen oder Anfragen erzeugen (Denial of Service)

## Unterstützt

Nur der aktuelle Stand von `main` (wird bei jedem Push veröffentlicht).

## Wie die Plattform geschützt ist

Bedrohungsmodell, Maßnahmen, automatische Prüfungen und bekannte Restrisiken:
[`docs/sicherheit.md`](docs/sicherheit.md).
