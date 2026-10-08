#!/usr/bin/env python3
"""Einmalige Übernahme der Daten des alten Discord-Bots (data.json, deaths.json).

Das Skript schreibt nichts in die Datenbank. Es erzeugt
  1. einen Bericht (Konsole + JSON) mit allem, was nicht eindeutig zugeordnet werden konnte,
  2. eine SQL-Datei, die alles in einer Transaktion importiert.

Die SQL-Datei wird erst nach Prüfung des Berichts ausgeführt, z. B. im SQL-Editor von Supabase
oder per psql. Sie legt eine Challenge an, die Spieler (die Leitung mit Konto, alle anderen als
Platzhalter, die per Einladungslink übernommen werden), die Routen und alle Ereignisse über
private.append_event mit Quelle "migration". Damit durchlaufen Altdaten dieselbe Validierung wie
neue Eingaben.

Beispiel:
  python3 tools/migration/migrate_bot_data.py \\
      --data data.json --deaths deaths.json \\
      --name "Platin Soul Link" --slug platin-soullink \\
      --owner Moritz --owner-discord-id 123456789012345678

Abbildung der Altdaten:
  - data.json enthält nur den laufenden Run (der Bot leert es bei /resetall).
  - Pro Route ist der erste Eintrag die wilde Begegnung, weitere Einträge sind Static-Begegnungen.
    Jeder Eintrag wird ein Soul-Link.
  - Der Bot hat nur die Entwicklungslinie gespeichert. Als gefangene Art gilt die erste Stufe.
  - deaths.json "dead" wird über die Entwicklungsreihe einer Begegnung des laufenden Runs
    zugeordnet. Mehrdeutige Namen lassen sich mit --assign NAME=SPIELER auflösen. Nicht
    zuordenbare Namen stammen vermutlich aus früheren Runs und werden nur berichtet.
  - "resets" bzw. die Summe aus "whipes" ergibt die Zahl abgeschlossener Runs (alle als Wipe).
  - Zähler: Was die Ereignisse nicht erklären, wird als counter_adjusted ("Altdaten Bot")
    ergänzt, sodass Tode und verpasste Begegnungen pro Spieler exakt den Bot-Zählern entsprechen.

Nur Standardbibliothek, Python 3.10+.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import uuid
from dataclasses import dataclass, field
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
NOTE = "Altdaten Bot"


class MigrationError(Exception):
    pass


@dataclass
class Encounter:
    id: str
    link_id: str
    player: str
    route: str
    kind: str
    line: list[dict]  # aufgelöste Arten der gespeicherten Entwicklungslinie
    dead: bool = False
    current_species: int | None = None


@dataclass
class Plan:
    players: list[str] = field(default_factory=list)
    routes: list[str] = field(default_factory=list)
    encounters: list[Encounter] = field(default_factory=list)
    deaths: list[tuple[Encounter, int]] = field(default_factory=list)  # (Begegnung, Art beim Tod)
    finished_runs: list[str | None] = field(default_factory=list)  # Verursacher je Wipe
    history_adjustments: list[tuple[str, str, int]] = field(default_factory=list)
    current_adjustments: list[tuple[str, str, int]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    unresolved: list[dict] = field(default_factory=list)


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


class SpeciesIndex:
    def __init__(self, species: list[dict], mapping: dict[str, str]):
        self.by_id = {s["id"]: s for s in species}
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


def load_json(path: Path, default):
    if not path.exists():
        return default
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def parse_entry(value) -> list[str]:
    """Ein Routeneintrag ist ein mehrzeiliger String; der Bot verträgt auch Listen von Zeilen."""
    if isinstance(value, str):
        return [line for line in value.split("\n") if line.strip()]
    if isinstance(value, list):
        lines: list[str] = []
        for item in value:
            lines.extend(parse_entry(item))
        return lines
    raise MigrationError(f"Unerwarteter Routeneintrag: {value!r}")


def build_plan(args, data: dict, deaths: dict, index: SpeciesIndex) -> Plan:
    plan = Plan()
    aliases = {k.lower(): v for k, v in (a.split("=", 1) for a in args.alias)}

    def canonical(name: str) -> str:
        name = name.strip()
        name = aliases.get(name.lower(), name)
        for player in plan.players:
            if player.lower() == name.lower():
                return player
        return name

    # ---------------------------------------------------------------- Routen und Begegnungen
    for route, value in data.items():
        entries = value if isinstance(value, list) else [value]
        if route not in plan.routes:
            plan.routes.append(route)
        for position, entry in enumerate(entries):
            kind = "wild" if position == 0 else "static"
            link_id = str(uuid.uuid4())
            seen: set[str] = set()
            if kind == "static":
                plan.warnings.append(f"{route}: Eintrag {position + 1} als Static-Begegnung übernommen")
            for line in parse_entry(entry):
                if ": " not in line and not line.rstrip().endswith(":"):
                    plan.warnings.append(f"{route}: Zeile ohne Spieler ignoriert: {line!r}")
                    continue
                player_raw, _, names_raw = line.partition(":")
                player = canonical(player_raw)
                if player not in plan.players:
                    plan.players.append(player)
                if player in seen:
                    plan.warnings.append(f"{route}: {player} doppelt im selben Eintrag, zweite Zeile ignoriert")
                    continue
                seen.add(player)
                names = [n.strip() for n in names_raw.split(",") if n.strip()]
                if not names:
                    plan.warnings.append(f"{route} ({kind}): keine Pokémon für {player} gespeichert, übersprungen")
                    continue
                line_species = []
                for name in names:
                    resolved = index.resolve(name)
                    if resolved is None:
                        plan.unresolved.append({"route": route, "player": player, "name": name})
                    else:
                        line_species.append(resolved)
                if not line_species:
                    plan.warnings.append(f"{route}: keine Art für {player} erkannt ({', '.join(names)}), übersprungen")
                    continue
                plan.encounters.append(
                    Encounter(
                        id=str(uuid.uuid4()),
                        link_id=link_id,
                        player=player,
                        route=route,
                        kind=kind,
                        line=line_species,
                        current_species=line_species[0]["id"],
                    )
                )

    # Spieler, die nur in den Zählern vorkommen
    for key in ("deaths", "alldeaths", "missed_encounters", "overall_missed_encounters", "whipes"):
        for name in deaths.get(key, {}) or {}:
            player = canonical(name)
            if player not in plan.players:
                plan.players.append(player)
                plan.warnings.append(f"Spieler {player!r} kommt nur in deaths.json ({key}) vor; Tippfehler? Sonst --alias nutzen")

    owner = canonical(args.owner)
    if owner not in plan.players:
        raise MigrationError(f"--owner {args.owner!r} ist keiner der Spieler: {', '.join(plan.players)}")

    # ---------------------------------------------------------------- Tote Pokémon
    assignments = {k.strip().lower(): canonical(v) for k, v in (a.split("=", 1) for a in args.assign)}
    for name in deaths.get("dead", []) or []:
        species = index.resolve(name)
        if species is None:
            plan.unresolved.append({"dead": name})
            continue
        candidates = [
            e for e in plan.encounters
            if any(s["evolution_chain_id"] == species["evolution_chain_id"] for s in e.line)
        ]
        if name.strip().lower() in assignments:
            candidates = [e for e in candidates if e.player == assignments[name.strip().lower()]]
        if not candidates:
            plan.warnings.append(f"Tod {name!r}: keine passende Begegnung im laufenden Run (früherer Run?), nicht übernommen")
            continue
        if len(candidates) > 1:
            plan.warnings.append(
                f"Tod {name!r}: mehrdeutig ({', '.join(f'{e.player}/{e.route}' for e in candidates)}), "
                f"mit --assign \"{name}=SPIELER\" auflösen; nicht übernommen"
            )
            continue
        encounter = candidates[0]
        if encounter.dead:
            plan.warnings.append(f"Tod {name!r}: {encounter.player}/{encounter.route} ist bereits tot, ignoriert")
            continue
        partners = [e for e in plan.encounters if e.link_id == encounter.link_id]
        if any(p.dead for p in partners):
            plan.warnings.append(
                f"Tod {name!r} ({encounter.player}/{encounter.route}): Soul-Link-Partner ist schon tot, "
                "zählt als mitgestorben"
            )
            continue
        encounter.dead = True
        plan.deaths.append((encounter, species["id"]))

    # ---------------------------------------------------------------- Abgeschlossene Runs
    whipes = {canonical(k): int(v) for k, v in (deaths.get("whipes") or {}).items()}
    culprits: list[str | None] = [player for player, count in whipes.items() for _ in range(count)]
    resets = int(deaths.get("resets") or 0)
    if resets < len(culprits):
        plan.warnings.append(f"resets={resets} ist kleiner als die Summe der Wipes ({len(culprits)}); Wipes gelten")
    culprits.extend([None] * max(0, resets - len(culprits)))
    plan.finished_runs = culprits

    # ---------------------------------------------------------------- Zähler
    def counter(key: str) -> dict[str, int]:
        result: dict[str, int] = {}
        for name, value in (deaths.get(key) or {}).items():
            player = canonical(name)
            result[player] = result.get(player, 0) + int(value)
        return result

    session_deaths, total_deaths = counter("deaths"), counter("alldeaths")
    session_missed, total_missed = counter("missed_encounters"), counter("overall_missed_encounters")

    for player in plan.players:
        derived_deaths = sum(1 for e, _ in plan.deaths if e.player == player)
        for name, session, total, derived in (
            ("deaths", session_deaths.get(player, 0), total_deaths.get(player, 0), derived_deaths),
            ("missed_encounters", session_missed.get(player, 0), total_missed.get(player, 0), 0),
        ):
            history = total - session
            if history < 0:
                plan.warnings.append(f"{player}: {name} gesamt ({total}) < laufender Run ({session}); gesamt wird angehoben")
                history = 0
            if history:
                if plan.finished_runs:
                    plan.history_adjustments.append((player, name, history))
                else:
                    plan.warnings.append(f"{player}: {history} {name} aus früheren Runs, aber keine Resets; im laufenden Run verbucht")
                    plan.current_adjustments.append((player, name, history))
            if session - derived:
                plan.current_adjustments.append((player, name, session - derived))
    return plan


def sql_str(value: str | None) -> str:
    if value is None:
        return "null"
    return "'" + value.replace("'", "''") + "'"


def sql_json(value: dict) -> str:
    return sql_str(json.dumps(value, ensure_ascii=False)) + "::jsonb"


def render_sql(args, plan: Plan) -> str:
    challenge_id = str(uuid.uuid4())
    member_ids = {player: str(uuid.uuid4()) for player in plan.players}
    route_ids = {route: str(uuid.uuid4()) for route in plan.routes}
    owner = next(p for p in plan.players if p.lower() == args.owner.strip().lower())

    out: list[str] = []
    emit = out.append

    def event(event_type: str, payload: dict) -> None:
        emit(
            f"  perform private.append_event(v_challenge, {sql_str(event_type)}, {sql_json(payload)}, "
            "'migration', null, null);"
        )

    emit("-- Generiert von tools/migration/migrate_bot_data.py. Vor dem Ausführen den Bericht prüfen.")
    emit("begin;")
    emit("do $migration$")
    emit("declare")
    emit(f"  v_challenge uuid := {sql_str(challenge_id)};")
    emit("  v_owner uuid;")
    emit("begin")
    emit(f"  select id into v_owner from public.profiles where discord_id = {sql_str(args.owner_discord_id)};")
    emit("  if v_owner is null then")
    emit(
        "    raise exception 'Kein Profil mit Discord-ID %. Zuerst einmal auf der Website mit Discord anmelden.', "
        f"{sql_str(args.owner_discord_id)};"
    )
    emit("  end if;")
    emit("")
    emit("  insert into public.challenges (id, slug, name, game, visibility, created_by)")
    emit(
        f"  values (v_challenge, {sql_str(args.slug)}, {sql_str(args.name)}, {sql_str(args.game)}, "
        f"{sql_str(args.visibility)}, v_owner);"
    )
    emit("")
    emit("  insert into public.challenge_members (id, challenge_id, user_id, role, display_name, seat, joined_at) values")
    rows = []
    for seat, player in enumerate(plan.players):
        if player == owner:
            rows.append(f"    ({sql_str(member_ids[player])}, v_challenge, v_owner, 'owner', {sql_str(player)}, {seat}, now())")
        else:
            rows.append(f"    ({sql_str(member_ids[player])}, v_challenge, null, 'player', {sql_str(player)}, {seat}, null)")
    emit(",\n".join(rows) + ";")
    emit("")
    if plan.routes:
        emit("  insert into public.routes (id, challenge_id, name, sort_order) values")
        emit(
            ",\n".join(
                f"    ({sql_str(route_ids[r])}, v_challenge, {sql_str(r)}, {i})" for i, r in enumerate(plan.routes)
            )
            + ";"
        )
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

    emit("  -- Laufender Run: Begegnungen")
    for e in plan.encounters:
        event("encounter_logged", {
            "encounter_id": e.id, "link_id": e.link_id, "member_id": member_ids[e.player],
            "route_id": route_ids[e.route], "species_id": e.line[0]["id"], "kind": e.kind, "status": "box",
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

    emit("end;")
    emit("$migration$;")
    emit("commit;")
    return "\n".join(out) + "\n"


def report(plan: Plan) -> dict:
    return {
        "spieler": plan.players,
        "routen": len(plan.routes),
        "begegnungen": len(plan.encounters),
        "static_begegnungen": sum(1 for e in plan.encounters if e.kind == "static"),
        "tode_zugeordnet": [f"{e.player}/{e.route}" for e, _ in plan.deaths],
        "abgeschlossene_runs": len(plan.finished_runs),
        "wipes_je_spieler": {p: plan.finished_runs.count(p) for p in plan.players if plan.finished_runs.count(p)},
        "zaehler_korrekturen_frueher": [list(a) for a in plan.history_adjustments],
        "zaehler_korrekturen_laufend": [list(a) for a in plan.current_adjustments],
        "nicht_erkannt": plan.unresolved,
        "hinweise": plan.warnings,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", type=Path, default=Path("data.json"), help="data.json des Bots")
    parser.add_argument("--deaths", type=Path, default=Path("deaths.json"), help="deaths.json des Bots")
    parser.add_argument("--mapping", type=Path, default=HERE / "pokemonMapping.json")
    parser.add_argument("--species", type=Path, default=ROOT / "data" / "species.json")
    parser.add_argument("--name", required=True, help="Name der Challenge")
    parser.add_argument("--slug", required=True, help="Adresse der Challenge, z. B. platin-soullink")
    parser.add_argument("--game", default="platinum")
    parser.add_argument("--visibility", choices=("public", "private"), default="private")
    parser.add_argument("--owner", required=True, help="Spielername der Challenge-Leitung, wie im Bot")
    parser.add_argument("--owner-discord-id", required=True, help="Discord-ID der Leitung (Profil muss existieren)")
    parser.add_argument("--alias", action="append", default=[], metavar="ALT=NEU", help="Spielernamen vereinheitlichen")
    parser.add_argument("--assign", action="append", default=[], metavar="POKEMON=SPIELER",
                        help="mehrdeutigen Tod einem Spieler zuordnen")
    parser.add_argument("--out", type=Path, default=Path("migration.sql"))
    parser.add_argument("--report", type=Path, default=Path("migration-report.json"))
    parser.add_argument("--strict", action="store_true", help="Abbruch bei nicht erkannten Namen")
    args = parser.parse_args(argv)

    if not re.fullmatch(r"[0-9]{5,25}", args.owner_discord_id):
        parser.error("--owner-discord-id muss eine Discord-ID (nur Ziffern) sein")
    if not args.data.exists():
        parser.error(f"{args.data} nicht gefunden")

    try:
        index = SpeciesIndex(load_json(args.species, []), load_json(args.mapping, {}))
        plan = build_plan(args, load_json(args.data, {}), load_json(args.deaths, {}), index)
    except MigrationError as error:
        print(f"Fehler: {error}", file=sys.stderr)
        return 1

    summary = report(plan)
    args.report.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in summary.items() if k != "hinweise"}, ensure_ascii=False, indent=2))
    for warning in plan.warnings:
        print(f"Hinweis: {warning}")
    if plan.unresolved and args.strict:
        print("Abbruch: nicht erkannte Namen (siehe nicht_erkannt).", file=sys.stderr)
        return 2

    args.out.write_text(render_sql(args, plan), encoding="utf-8")
    print(f"\nSQL geschrieben: {args.out}  Bericht: {args.report}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
