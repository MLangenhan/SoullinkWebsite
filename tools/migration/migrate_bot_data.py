#!/usr/bin/env python3
"""Einmalige Übernahme der Zähler des alten Discord-Bots (stats.json).

Das Skript schreibt nichts in die Datenbank. Es erzeugt
  1. einen Bericht (Konsole + JSON),
  2. eine SQL-Datei, die alles in einer Transaktion importiert,
  3. pro Spieler einen persönlichen Einladungslink (nur auf der Konsole bzw. mit --links-out).

Die SQL-Datei wird nach Prüfung des Berichts ausgeführt, z. B. im SQL-Editor von Supabase. Sie legt
eine Challenge an, alle Spieler als freie Plätze (die Leitung mit Rolle owner), je Platz einen
Einladungslink und die Ereignisse über private.append_event mit Quelle "migration". Damit
durchlaufen Altdaten dieselbe Validierung wie neue Eingaben. Die SQL-Datei enthält nur die Hashes
der Einladungslinks, keine Geheimnisse.

Beispiel:
  python3 tools/migration/migrate_bot_data.py --stats stats.json \\
      --name "Platin Soul Link" --slug platin-soullink --owner Moritz \\
      --site-url https://soullink.example.app

Abbildung von stats.json:
  - "resets" bzw. die Summe aus "wipes" ergibt die abgeschlossenen Runs, jeweils als Wipe mit
    Verursacher. Der laufende Run ist der nächste.
  - "deaths"/"missed_encounters" sind die Zähler des laufenden Runs, "alldeaths"/
    "overall_missed_encounters" die Gesamtzähler. Beides wird als counter_adjusted ("Altdaten Bot")
    übernommen: die Differenz im ersten Run, der Rest im laufenden Run. Danach entsprechen alle
    Zähler exakt dem Bot.
  - "dead_pokemon" enthält nur Namen ohne Spieler oder Route. Ohne Begegnungsdaten lassen sie sich
    keinem Pokémon zuordnen; sie erscheinen nur im Bericht.
  - "soul_links": Das Format ist noch unbekannt. Ist der Eintrag nicht leer, bricht das Skript ab.

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
class Plan:
    players: list[str] = field(default_factory=list)
    finished_runs: list[str | None] = field(default_factory=list)  # Verursacher je Wipe
    history_adjustments: list[tuple[str, str, int]] = field(default_factory=list)
    current_adjustments: list[tuple[str, str, int]] = field(default_factory=list)
    dead_pokemon: list[dict] = field(default_factory=list)
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


def load_json(path: Path):
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def build_plan(args, stats: dict, index: SpeciesIndex) -> Plan:
    plan = Plan()
    aliases = {k.strip().lower(): v.strip() for k, v in (a.split("=", 1) for a in args.alias)}

    def canonical(name: str) -> str:
        name = aliases.get(name.strip().lower(), name.strip())
        for player in plan.players:
            if player.lower() == name.lower():
                return player
        plan.players.append(name)
        return name

    if stats.get("soul_links"):
        raise MigrationError(
            '"soul_links" ist nicht leer. Das Format kenne ich noch nicht; bitte ein Beispiel schicken, '
            "dann übernimmt das Skript auch die Begegnungen."
        )

    wipes_key = "wipes" if "wipes" in stats else "whipes"
    for key in ("deaths", "alldeaths", "missed_encounters", "overall_missed_encounters", wipes_key):
        for name in stats.get(key) or {}:
            canonical(name)

    owner_name = aliases.get(args.owner.strip().lower(), args.owner.strip())
    if not any(p.lower() == owner_name.lower() for p in plan.players):
        raise MigrationError(f"--owner {args.owner!r} kommt in stats.json nicht vor: {', '.join(plan.players)}")

    # ---------------------------------------------------------------- Abgeschlossene Runs
    culprits: list[str | None] = []
    for name, count in (stats.get(wipes_key) or {}).items():
        culprits.extend([canonical(name)] * int(count))
    resets = int(stats.get("resets") or 0)
    if resets < len(culprits):
        plan.warnings.append(f"resets={resets} ist kleiner als die Summe der Wipes ({len(culprits)}); die Wipes gelten")
    culprits.extend([None] * max(0, resets - len(culprits)))
    plan.finished_runs = culprits

    # ---------------------------------------------------------------- Zähler
    def counter(key: str) -> dict[str, int]:
        result: dict[str, int] = {}
        for name, value in (stats.get(key) or {}).items():
            player = canonical(name)
            result[player] = result.get(player, 0) + int(value)
        return result

    for counter_name, session_key, total_key in COUNTERS:
        session, total = counter(session_key), counter(total_key)
        for player in plan.players:
            run_value, total_value = session.get(player, 0), total.get(player, 0)
            history = total_value - run_value
            if history < 0:
                plan.warnings.append(
                    f"{player}: {total_key} ({total_value}) < {session_key} ({run_value}); gesamt wird angehoben"
                )
                history = 0
            if history and not plan.finished_runs:
                plan.warnings.append(f"{player}: {history} {counter_name} aus früheren Runs, aber keine Resets; im laufenden Run verbucht")
                run_value += history
                history = 0
            if history:
                plan.history_adjustments.append((player, counter_name, history))
            if run_value:
                plan.current_adjustments.append((player, counter_name, run_value))

    # ---------------------------------------------------------------- Tote Pokémon (nur Bericht)
    for name in stats.get("dead_pokemon") or []:
        species = index.resolve(name)
        if species is None:
            plan.warnings.append(f"Totes Pokémon {name!r} nicht erkannt (Tippfehler?)")
        plan.dead_pokemon.append({"name": name, "art": species["name_de"] if species else None})
    if plan.dead_pokemon:
        plan.warnings.append(
            f"{len(plan.dead_pokemon)} tote Pokémon ohne Spieler/Route: nur im Bericht, nicht auf dem Friedhof"
        )
    return plan


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
    aliases = {k.strip().lower(): v.strip() for k, v in (a.split("=", 1) for a in args.alias)}
    owner_name = aliases.get(args.owner.strip().lower(), args.owner.strip())
    owner = next(p for p in plan.players if p.lower() == owner_name.lower())
    expires = datetime.now(timezone.utc) + timedelta(days=args.invite_days)

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
    emit("begin")
    emit("  insert into public.challenges (id, slug, name, game, visibility)")
    emit(f"  values (v_challenge, {sql_str(args.slug)}, {sql_str(args.name)}, {sql_str(args.game)}, {sql_str(args.visibility)});")
    emit("")
    emit("  insert into public.challenge_members (id, challenge_id, role, display_name, seat) values")
    emit(",\n".join(
        f"    ({sql_str(member_ids[p])}, v_challenge, {sql_str('owner' if p == owner else 'player')}, {sql_str(p)}, {seat})"
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
    if plan.current_adjustments:
        emit("  -- Laufender Run: Zählerstände")
        for player, name, delta in plan.current_adjustments:
            event("counter_adjusted", {"counter": name, "member_id": member_ids[player], "delta": delta, "note": NOTE})

    emit("end;")
    emit("$migration$;")
    emit("commit;")
    return "\n".join(out) + "\n"


def report(plan: Plan) -> dict:
    return {
        "spieler": plan.players,
        "abgeschlossene_runs": len(plan.finished_runs),
        "laufender_run": len(plan.finished_runs) + 1,
        "wipes_je_spieler": {p: plan.finished_runs.count(p) for p in plan.players if plan.finished_runs.count(p)},
        "zaehler_frueher": [list(a) for a in plan.history_adjustments],
        "zaehler_laufend": [list(a) for a in plan.current_adjustments],
        "tote_pokemon": plan.dead_pokemon,
        "hinweise": plan.warnings,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--stats", type=Path, default=Path("stats.json"), help="stats.json des Bots (laufender Run)")
    parser.add_argument("--mapping", type=Path, default=HERE / "pokemonMapping.json")
    parser.add_argument("--species", type=Path, default=ROOT / "data" / "species.json")
    parser.add_argument("--name", required=True, help="Name der Challenge")
    parser.add_argument("--slug", required=True, help="Adresse der Challenge, z. B. platin-soullink")
    parser.add_argument("--game", default="platinum")
    parser.add_argument("--visibility", choices=("public", "private"), default="private")
    parser.add_argument("--owner", required=True, help="Spielername der Challenge-Leitung, wie in stats.json")
    parser.add_argument("--site-url", default="http://localhost:5173", help="Adresse der Website für die Einladungslinks")
    parser.add_argument("--invite-days", type=int, default=14, help="Gültigkeit der Einladungslinks in Tagen")
    parser.add_argument("--alias", action="append", default=[], metavar="ALT=NEU", help="Spielernamen vereinheitlichen")
    parser.add_argument("--out", type=Path, default=Path("migration.sql"))
    parser.add_argument("--report", type=Path, default=Path("migration-report.json"))
    parser.add_argument("--links-out", type=Path, help="Einladungslinks zusätzlich als JSON speichern (geheim!)")
    args = parser.parse_args(argv)

    if not args.stats.exists():
        parser.error(f"{args.stats} nicht gefunden")
    if not 1 <= args.invite_days <= 30:
        parser.error("--invite-days muss zwischen 1 und 30 liegen")
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", args.slug) or not 3 <= len(args.slug) <= 40:
        parser.error("--slug: 3–40 Zeichen, nur a–z, 0–9 und Bindestriche")

    try:
        index = SpeciesIndex(load_json(args.species), load_json(args.mapping))
        plan = build_plan(args, load_json(args.stats), index)
    except MigrationError as error:
        print(f"Fehler: {error}", file=sys.stderr)
        return 1

    member_ids = {player: str(uuid.uuid4()) for player in plan.players}
    tokens = {player: new_invite_token() for player in plan.players}

    summary = report(plan)
    args.report.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.out.write_text(render_sql(args, plan, member_ids, tokens), encoding="utf-8")

    print(json.dumps({k: v for k, v in summary.items() if k != "hinweise"}, ensure_ascii=False, indent=2))
    for warning in plan.warnings:
        print(f"Hinweis: {warning}")
    site = args.site_url.rstrip("/")
    links = {player: f"{site}/join#{tokens[player]}" for player in plan.players}
    print(f"\nEinladungslinks (geheim, je einmal nutzbar, {args.invite_days} Tage gültig; gelten erst nach dem Import):")
    for player, link in links.items():
        print(f"  {player}: {link}")
    if args.links_out:
        args.links_out.write_text(json.dumps(links, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nSQL: {args.out}  Bericht: {args.report}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
