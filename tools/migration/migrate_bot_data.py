#!/usr/bin/env python3
"""Einmalige Übernahme eines Runs aus dem Discord-Bot (Ordner data/runs/<id>/).

Ein Bot-Run (meta.json, routes.json, stats.json) wird eine Challenge auf der Website. Das Skript
schreibt nichts in die Datenbank. Es erzeugt
  1. einen Bericht (Konsole + JSON),
  2. eine SQL-Datei, die alles in einer Transaktion importiert (Supabase → SQL Editor),
  3. pro Spieler einen persönlichen Einladungslink (Konsole bzw. --links-out).

Die SQL-Datei enthält nur die Hashes der Einladungslinks, keine Geheimnisse. Alle Ereignisse laufen
über private.append_event mit Quelle "migration", also durch dieselbe Validierung wie neue Eingaben.

Beispiel (Windows, PowerShell; --run-dir darf auch der ganze runs-Ordner sein, dann fragt das Skript):
  py tools\\migration\\migrate_bot_data.py --run-dir "C:\\Users\\...\\Soullink Bot\\data\\runs"

Beispiel (Linux/macOS):
  python3 tools/migration/migrate_bot_data.py --run-dir ../Soullinkbot/data/runs/1a2b3c4d --owner Moritz

Fehlende Angaben (welcher Run, wer die Leitung ist) fragt das Skript in der Konsole ab.

Abbildung:
  - meta.json: Name, Spiel und Spieler (in dieser Reihenfolge). Status "completed" → der laufende Run
    endet am Schluss als Sieg.
  - Soul-Links wie im Bot paarweise nach Reihenfolge (1↔2, 3↔4); mit --links all alle gemeinsam.
  - routes.json: der laufende Run. Pro Route und Paar ein Soul-Link. Der Bot speichert nur die
    Entwicklungslinie, als gefangene Art gilt die erste Stufe.
  - stats.json "dead_pokemon": wie im Bot über die Entwicklungslinie den Begegnungen zugeordnet (bei
    Bedarf mit Entwicklung auf die genannte Stufe). Der mitgestorbene Partner steht im Bot ebenfalls
    in der Liste und wird hier als "mitgestorben" erkannt. Mehrdeutige Namen: --assign NAME=SPIELER.
    Namen ohne passende Begegnung (der Bot leert die Liste bei /resetall nicht) stehen nur im Bericht.
  - "resets" bzw. die Summe aus "wipes" ergibt die abgeschlossenen Runs (Wipes mit Verursacher).
  - Zähler: Was die Ereignisse nicht erklären, wird als counter_adjusted ("Altdaten Bot") ergänzt,
    sodass Tode und verpasste Begegnungen pro Spieler (Run und gesamt) exakt dem Bot entsprechen.

Ohne Ordner geht auch nur eine stats.json (--stats, dann ohne Begegnungen, Name per --name).

Nur Standardbibliothek, Python 3.10+.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import secrets
import sys
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
NOTE = "Altdaten Bot"
COUNTERS = (
    ("deaths", "deaths", "alldeaths"),
    ("missed_encounters", "missed_encounters", "overall_missed_encounters"),
)


class MigrationError(Exception):
    pass


@dataclass
class Encounter:
    id: str
    link_id: str
    player: str
    route: str
    line: list[dict]
    dead: bool = False


@dataclass
class Plan:
    name: str = ""
    game: str = "platinum"
    completed: bool = False
    players: list[str] = field(default_factory=list)
    groups: dict[str, int | None] = field(default_factory=dict)
    routes: list[str] = field(default_factory=list)
    encounters: list[Encounter] = field(default_factory=list)
    deaths: list[tuple[Encounter, int]] = field(default_factory=list)
    finished_runs: list[str | None] = field(default_factory=list)
    history_adjustments: list[tuple[str, str, int]] = field(default_factory=list)
    current_adjustments: list[tuple[str, str, int]] = field(default_factory=list)
    unresolved: list[dict] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


class SpeciesIndex:
    def __init__(self, species: list[dict], mapping: dict[str, str]):
        self.by_key: dict[str, dict] = {}
        for s in species:
            for key in (s["slug"], slugify(s["name_en"]), slugify(s["name_de"])):
                self.by_key.setdefault(key, s)
        # Bot-Schreibweise (deutscher Name, kleingeschrieben) -> englischer PokeAPI-Name
        for german, english in mapping.items():
            target = self.by_key.get(slugify(english))
            if target:
                self.by_key.setdefault(slugify(german), target)
                self.by_key[german.lower()] = target

    def resolve(self, name: str) -> dict | None:
        key = name.strip().lower()
        return self.by_key.get(key) or self.by_key.get(slugify(key))


def load_json(path: Path, default=None):
    if not path.exists():
        if default is not None:
            return default
        raise MigrationError(f"{path} nicht gefunden")
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def build_plan(args, meta: dict, routes: dict, stats: dict, index: SpeciesIndex) -> Plan:
    plan = Plan()
    aliases = {k.strip().lower(): v.strip() for k, v in (a.split("=", 1) for a in args.alias)}

    def canonical(name: str, add: bool = True) -> str:
        name = aliases.get(name.strip().lower(), name.strip())
        for player in plan.players:
            if player.lower() == name.lower():
                return player
        if add:
            plan.players.append(name)
        return name

    plan.name = args.name or meta.get("name") or ""
    if not plan.name:
        raise MigrationError("Kein Name: --name angeben oder meta.json mitgeben")
    plan.game = args.game or meta.get("game") or "platinum"
    plan.completed = meta.get("status") == "completed"

    if stats.get("soul_links"):
        plan.warnings.append('"soul_links" ist nicht leer und wird ignoriert; Paare ergeben sich aus der Spielerreihenfolge')

    # ---------------------------------------------------------------- Spieler und Soul-Link-Gruppen
    for name in meta.get("players") or []:
        canonical(name)
    wipes_key = "wipes" if "wipes" in stats else "whipes"
    for key in ("deaths", "alldeaths", "missed_encounters", "overall_missed_encounters", wipes_key):
        for name in stats.get(key) or {}:
            before = len(plan.players)
            canonical(name)
            if meta.get("players") and len(plan.players) > before:
                plan.warnings.append(f"Spieler {name!r} steht nur in stats.json ({key}); Tippfehler? Sonst --alias")
    if not plan.players:
        raise MigrationError("Keine Spieler gefunden")
    for seat, player in enumerate(plan.players):
        plan.groups[player] = seat // 2 if args.links == "pairs" else None
    if args.links == "pairs" and len(plan.players) % 2:
        plan.warnings.append(f"Ungerade Spielerzahl: {plan.players[-1]} hat keinen Soul-Link-Partner")

    owner_name = aliases.get(args.owner.strip().lower(), args.owner.strip())
    if not any(p.lower() == owner_name.lower() for p in plan.players):
        raise MigrationError(f"--owner {args.owner!r} ist keiner der Spieler: {', '.join(plan.players)}")

    # ---------------------------------------------------------------- Routen und Begegnungen (laufender Run)
    for route, entry in routes.items():
        if not isinstance(entry, dict):
            raise MigrationError(f"Unerwartetes Format in routes.json bei {route!r}")
        plan.routes.append(route)
        links: dict[int | None, str] = {}
        for player_raw, evo_line in entry.items():
            player = canonical(player_raw, add=False)
            if player not in plan.players:
                plan.warnings.append(f"{route}: unbekannter Spieler {player_raw!r}, übersprungen")
                continue
            names = [n for n in (evo_line or []) if str(n).strip()]
            resolved = []
            for name in names:
                species = index.resolve(name)
                if species is None:
                    plan.unresolved.append({"route": route, "player": player, "name": name})
                else:
                    resolved.append(species)
            if not resolved:
                plan.warnings.append(f"{route}: kein Pokémon für {player} erkannt, übersprungen")
                continue
            group = plan.groups[player]
            links.setdefault(group, str(uuid.uuid4()))
            plan.encounters.append(Encounter(str(uuid.uuid4()), links[group], player, route, resolved))

    # ---------------------------------------------------------------- Tote Pokémon
    assignments = {k.strip().lower(): canonical(v, add=False) for k, v in (a.split("=", 1) for a in args.assign)}
    for name in stats.get("dead_pokemon") or []:
        species = index.resolve(name)
        if species is None:
            plan.unresolved.append({"dead": name})
            continue
        candidates = [e for e in plan.encounters if any(s["id"] == species["id"] for s in e.line)]
        if name.strip().lower() in assignments:
            candidates = [e for e in candidates if e.player == assignments[name.strip().lower()]]
        if not candidates:
            plan.warnings.append(f"Tod {name!r}: keine Begegnung im laufenden Run (früherer Run?), nur im Bericht")
            continue
        if len(candidates) > 1:
            plan.warnings.append(
                f"Tod {name!r}: mehrdeutig ({', '.join(f'{e.player}/{e.route}' for e in candidates)}), "
                f'mit --assign "{name}=SPIELER" auflösen; nicht übernommen'
            )
            continue
        encounter = candidates[0]
        if encounter.dead or any(e.dead for e in plan.encounters if e.link_id == encounter.link_id):
            plan.warnings.append(f"Tod {name!r} ({encounter.player}/{encounter.route}): über den Soul-Link mitgestorben")
            continue
        encounter.dead = True
        plan.deaths.append((encounter, species["id"]))

    # ---------------------------------------------------------------- Abgeschlossene Runs
    culprits: list[str | None] = []
    for name, count in (stats.get(wipes_key) or {}).items():
        culprits.extend([canonical(name, add=False)] * int(count))
    resets = int(stats.get("resets") or 0)
    if resets < len(culprits):
        plan.warnings.append(f"resets={resets} ist kleiner als die Summe der Wipes ({len(culprits)}); die Wipes gelten")
    culprits.extend([None] * max(0, resets - len(culprits)))
    plan.finished_runs = culprits

    # ---------------------------------------------------------------- Zähler
    def counter(key: str) -> dict[str, int]:
        result: dict[str, int] = {}
        for name, value in (stats.get(key) or {}).items():
            player = canonical(name, add=False)
            result[player] = result.get(player, 0) + int(value)
        return result

    derived_deaths = {p: sum(1 for e, _ in plan.deaths if e.player == p) for p in plan.players}
    for counter_name, session_key, total_key in COUNTERS:
        session, total = counter(session_key), counter(total_key)
        for player in plan.players:
            run_value, total_value = session.get(player, 0), total.get(player, 0)
            history = total_value - run_value
            if history < 0:
                plan.warnings.append(f"{player}: {total_key} ({total_value}) < {session_key} ({run_value}); gesamt wird angehoben")
                history = 0
            if history and not plan.finished_runs:
                plan.warnings.append(f"{player}: {history} {counter_name} aus früheren Runs ohne Resets; im laufenden Run verbucht")
                run_value += history
                history = 0
            if history:
                plan.history_adjustments.append((player, counter_name, history))
            delta = run_value - (derived_deaths[player] if counter_name == "deaths" else 0)
            if delta:
                plan.current_adjustments.append((player, counter_name, delta))
    return plan


def ask(prompt: str) -> str:
    """Eingabe in der Konsole; ohne Konsole (z. B. in Skripten) mit klarer Fehlermeldung."""
    if not sys.stdin.isatty():
        raise MigrationError(f"{prompt.strip()} – bitte als Option angeben (siehe --help)")
    try:
        return input(prompt).strip()
    except EOFError as error:
        raise MigrationError("Abgebrochen") from error


def choose(title: str, options: list[str]) -> int:
    """Nummerierte Auswahl in der Konsole, gibt den Index zurück."""
    print(title)
    for number, option in enumerate(options, start=1):
        print(f"  [{number}] {option}")
    while True:
        answer = ask(f"Nummer (1–{len(options)}): ")
        if answer.isdigit() and 1 <= int(answer) <= len(options):
            return int(answer) - 1
        print("Bitte eine der Nummern eingeben.")


def clean_path(path: Path) -> Path:
    """Pfad aus der Konsole: Anführungszeichen entfernen, ~ auflösen (Leerzeichen sind erlaubt)."""
    return Path(str(path).strip().strip('"').strip("'")).expanduser()


def pick_run_dir(path: Path) -> Path:
    """Akzeptiert einen einzelnen Run-Ordner oder den ganzen runs-Ordner des Bots (dann Auswahl)."""
    path = clean_path(path)
    if not path.is_dir():
        raise MigrationError(f"Ordner nicht gefunden: {path}")
    if (path / "stats.json").exists():
        return path
    runs = sorted((d for d in path.iterdir() if d.is_dir() and (d / "stats.json").exists()), key=lambda d: d.name)
    if not runs:
        raise MigrationError(f"In {path} liegt weder eine stats.json noch ein Run-Ordner mit stats.json")
    if len(runs) == 1:
        return runs[0]

    def describe(run: Path) -> str:
        meta = load_json(run / "meta.json", {})
        status = "abgeschlossen" if meta.get("status") == "completed" else "aktiv"
        players = ", ".join(meta.get("players") or [])
        return f"{meta.get('name') or run.name} ({meta.get('game') or '?'}) · {players} · {status} · {run.name}"

    return runs[choose(f"In {path} liegen mehrere Runs. Welcher soll übernommen werden?", [describe(r) for r in runs])]


def candidate_players(meta: dict, stats: dict) -> list[str]:
    names: list[str] = []
    for name in meta.get("players") or []:
        if name not in names:
            names.append(name)
    for key in ("deaths", "alldeaths", "missed_encounters", "overall_missed_encounters"):
        for name in stats.get(key) or {}:
            if name not in names:
                names.append(name)
    return names


def new_invite_token() -> str:
    """Gleiches Format wie private.new_token('inv_') in der Datenbank."""
    return "inv_" + base64.urlsafe_b64encode(secrets.token_bytes(32)).decode("ascii").rstrip("=")


def sql_str(value: str | None) -> str:
    if value is None:
        return "null"
    return "'" + value.replace("'", "''") + "'"


def sql_json(value: dict) -> str:
    return sql_str(json.dumps(value, ensure_ascii=False)) + "::jsonb"


def render_sql(args, plan: Plan, member_ids: dict[str, str], tokens: dict[str, str]) -> str:
    challenge_id = str(uuid.uuid4())
    route_ids = {route: str(uuid.uuid4()) for route in plan.routes}
    owner_name = {k.strip().lower(): v.strip() for k, v in (a.split("=", 1) for a in args.alias)}.get(
        args.owner.strip().lower(), args.owner.strip()
    )
    owner = next(p for p in plan.players if p.lower() == owner_name.lower())
    expires = datetime.now(timezone.utc) + timedelta(days=args.invite_days)

    out: list[str] = []
    emit = out.append

    def event(event_type: str, payload: dict) -> None:
        emit(
            f"  perform private.append_event(v_challenge, {sql_str(event_type)}, {sql_json(payload)}, "
            "'migration', null, null);"
        )

    def group_sql(player: str) -> str:
        group = plan.groups[player]
        return "null" if group is None else str(group)

    emit("-- Generiert von tools/migration/migrate_bot_data.py. Vor dem Ausführen den Bericht prüfen.")
    emit("begin;")
    emit("do $migration$")
    emit("declare")
    emit(f"  v_challenge uuid := {sql_str(challenge_id)};")
    emit("begin")
    emit("  insert into public.challenges (id, slug, name, game, visibility)")
    emit(f"  values (v_challenge, {sql_str(args.slug)}, {sql_str(plan.name)}, {sql_str(plan.game)}, {sql_str(args.visibility)});")
    emit("")
    emit("  insert into public.challenge_members (id, challenge_id, role, display_name, seat, link_group) values")
    emit(",\n".join(
        f"    ({sql_str(member_ids[p])}, v_challenge, {sql_str('owner' if p == owner else 'player')}, {sql_str(p)}, {seat}, {group_sql(p)})"
        for seat, p in enumerate(plan.players)
    ) + ";")
    emit("")
    emit("  -- Persönliche Einladungslinks (nur die SHA-256-Hashes)")
    emit("  insert into public.challenge_invites (challenge_id, token_hash, role, member_id, max_uses, expires_at) values")
    emit(",\n".join(
        f"    (v_challenge, decode({sql_str(hashlib.sha256(tokens[p].encode()).hexdigest())}, 'hex'), "
        f"{sql_str('owner' if p == owner else 'player')}, {sql_str(member_ids[p])}, 1, {sql_str(expires.isoformat())})"
        for p in plan.players
    ) + ";")
    emit("")
    if plan.routes:
        emit("  insert into public.routes (id, challenge_id, name, sort_order) values")
        emit(",\n".join(
            f"    ({sql_str(route_ids[r])}, v_challenge, {sql_str(r)}, {i})" for i, r in enumerate(plan.routes)
        ) + ";")
        emit("")

    if plan.finished_runs:
        emit("  -- Frühere Runs: Zähler-Summen im ersten Run, danach je Run ein Wipe")
        for player, name, delta in plan.history_adjustments:
            event("counter_adjusted", {
                "counter": name, "member_id": member_ids[player], "delta": delta,
                "note": f"{NOTE}: Summe aller früheren Runs",
            })
        for culprit in plan.finished_runs:
            payload = {"result": "wipe", "note": NOTE}
            if culprit:
                payload["caused_by_member_id"] = member_ids[culprit]
            event("run_ended", payload)
        emit("")

    if plan.encounters:
        emit("  -- Laufender Run: Begegnungen")
        for e in plan.encounters:
            event("encounter_logged", {
                "encounter_id": e.id, "link_id": e.link_id, "member_id": member_ids[e.player],
                "route_id": route_ids[e.route], "species_id": e.line[0]["id"], "kind": "wild", "status": "box",
            })
    if plan.deaths:
        emit("")
        emit("  -- Laufender Run: Tode (bei Bedarf vorher die Entwicklung, mit der das Pokémon starb)")
        for encounter, species_id in plan.deaths:
            if species_id != encounter.line[0]["id"]:
                event("encounter_evolved", {"encounter_id": encounter.id, "species_id": species_id})
            event("pokemon_died", {"encounter_id": encounter.id, "cause": NOTE})
    if plan.current_adjustments:
        emit("")
        emit("  -- Laufender Run: Zähler, die die Ereignisse nicht erklären")
        for player, name, delta in plan.current_adjustments:
            event("counter_adjusted", {"counter": name, "member_id": member_ids[player], "delta": delta, "note": NOTE})
    if plan.completed:
        emit("")
        emit("  -- Im Bot abgeschlossen (Hall of Fame)")
        event("run_ended", {"result": "won", "note": NOTE})

    emit("end;")
    emit("$migration$;")
    emit("commit;")
    return "\n".join(out) + "\n"


def report(plan: Plan) -> dict:
    return {
        "challenge": plan.name,
        "spiel": plan.game,
        "spieler": plan.players,
        "soul_link_gruppen": plan.groups,
        "routen": len(plan.routes),
        "begegnungen": len(plan.encounters),
        "tode": [f"{e.player}/{e.route}" for e, _ in plan.deaths],
        "abgeschlossene_runs": len(plan.finished_runs) + (1 if plan.completed else 0),
        "gewonnen": plan.completed,
        "wipes_je_spieler": {p: plan.finished_runs.count(p) for p in plan.players if plan.finished_runs.count(p)},
        "zaehler_frueher": [list(a) for a in plan.history_adjustments],
        "zaehler_laufend": [list(a) for a in plan.current_adjustments],
        "nicht_erkannt": plan.unresolved,
        "hinweise": plan.warnings,
    }


def summary_text(plan: Plan) -> str:
    """Kurze, lesbare Zusammenfassung für die Konsole (Details stehen im JSON-Bericht)."""
    if any(group is not None for group in plan.groups.values()):
        pairs: dict[int, list[str]] = {}
        for player, group in plan.groups.items():
            pairs.setdefault(group if group is not None else -1, []).append(player)
        links = " · ".join(" ↔ ".join(names) for names in pairs.values())
    else:
        links = "alle gemeinsam"
    lines = [
        "",
        f"Challenge:    {plan.name} ({plan.game})",
        f"Spieler:      {', '.join(plan.players)}",
        f"Soul-Links:   {links}",
        f"Laufender Run {len(plan.finished_runs) + 1}: {len(plan.routes)} Routen, {len(plan.encounters)} Begegnungen, "
        f"{len(plan.deaths)} Tode" + (" · danach als gewonnen abgeschlossen" if plan.completed else ""),
        f"Frühere Runs: {len(plan.finished_runs)}",
    ]
    if plan.unresolved:
        names = ", ".join(str(u.get("name") or u.get("dead")) for u in plan.unresolved)
        lines.append(f"Nicht erkannt: {names}")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--run-dir", type=Path, help="Bot-Ordner data/runs/<id> mit meta.json, routes.json, stats.json")
    source.add_argument("--stats", type=Path, help="nur eine stats.json (ohne Begegnungen)")
    parser.add_argument("--mapping", type=Path, default=HERE / "pokemonMapping.json")
    parser.add_argument("--species", type=Path, default=ROOT / "data" / "species.json")
    parser.add_argument("--name", help="Name der Challenge (Standard: aus meta.json)")
    parser.add_argument("--slug", help="Adresse der Challenge (Standard: aus dem Namen)")
    parser.add_argument("--game", help="Spiel (Standard: aus meta.json)")
    parser.add_argument("--visibility", choices=("public", "private"), default="private")
    parser.add_argument("--owner", help="Spielername der Challenge-Leitung (sonst Abfrage)")
    parser.add_argument("--links", choices=("pairs", "all"), default="pairs",
                        help="Soul-Links paarweise nach Reihenfolge (wie im Bot) oder alle gemeinsam")
    parser.add_argument("--site-url", default="https://mlangenhan.github.io/SoullinkWebsite",
                        help="Adresse der Website inkl. Pfad, z. B. https://<name>.github.io/SoullinkWebsite")
    parser.add_argument("--invite-days", type=int, default=14, help="Gültigkeit der Einladungslinks in Tagen")
    parser.add_argument("--alias", action="append", default=[], metavar="ALT=NEU", help="Spielernamen vereinheitlichen")
    parser.add_argument("--assign", action="append", default=[], metavar="POKEMON=SPIELER",
                        help="mehrdeutigen Tod einem Spieler zuordnen")
    parser.add_argument("--out", type=Path, default=Path("migration.sql"))
    parser.add_argument("--report", type=Path, default=Path("migration-report.json"))
    parser.add_argument("--links-out", type=Path, help="Einladungslinks zusätzlich als JSON speichern (geheim!)")
    args = parser.parse_args(argv)

    if not 1 <= args.invite_days <= 30:
        parser.error("--invite-days muss zwischen 1 und 30 liegen")

    try:
        if args.run_dir:
            run_dir = pick_run_dir(args.run_dir)
            print(f"Run-Ordner: {run_dir}")
            meta = load_json(run_dir / "meta.json", {})
            routes = load_json(run_dir / "routes.json", {})
            stats = load_json(run_dir / "stats.json")
        else:
            meta, routes, stats = {}, {}, load_json(clean_path(args.stats))
        if not args.owner:
            players = candidate_players(meta, stats)
            if not players:
                raise MigrationError("Keine Spieler gefunden")
            args.owner = players[choose("Wer wird Leitung der Challenge (bekommt alle Rechte)?", players)]
        index = SpeciesIndex(load_json(args.species), load_json(args.mapping))
        plan = build_plan(args, meta, routes, stats, index)
    except MigrationError as error:
        print(f"Fehler: {error}", file=sys.stderr)
        return 1

    args.slug = args.slug or slugify(plan.name)[:40].strip("-")
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", args.slug) or not 3 <= len(args.slug) <= 40:
        parser.error("--slug: 3–40 Zeichen, nur a–z, 0–9 und Bindestriche")

    member_ids = {player: str(uuid.uuid4()) for player in plan.players}
    tokens = {player: new_invite_token() for player in plan.players}

    summary = report(plan)
    args.report.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.out.write_text(render_sql(args, plan, member_ids, tokens), encoding="utf-8")

    print(summary_text(plan))
    for warning in plan.warnings:
        print(f"Hinweis: {warning}")
    site = args.site_url.rstrip("/")
    links = {player: f"{site}/join#{tokens[player]}" for player in plan.players}
    print(f"\nEinladungslinks (geheim, je einmal nutzbar, {args.invite_days} Tage gültig; gelten erst nach dem Import):")
    for player, link in links.items():
        print(f"  {player}: {link}")
    if args.links_out:
        args.links_out.write_text(json.dumps(links, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nSQL-Datei:  {args.out.resolve()}")
    print(f"Bericht:    {args.report.resolve()}")
    print(f"Adresse:    {site}/c/{args.slug}")
    print("\nNächste Schritte:")
    print("  1. Hinweise oben prüfen.")
    print("  2. Inhalt der SQL-Datei im Supabase-Dashboard unter SQL Editor einfügen und ausführen.")
    print(f"  3. Zuerst den Link von {args.owner} öffnen (damit wird man Leitung), danach die anderen verschicken.")
    return 0


if __name__ == "__main__":
    # Windows-Konsolen nutzen teils noch alte Codepages; Umlaute und Pfeile sicher ausgeben
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    sys.exit(main())
