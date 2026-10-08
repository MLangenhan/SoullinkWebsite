#!/usr/bin/env python3
"""Erzeugt die Pokédex-Daten der Website aus den CSV-Dateien von PokeAPI.

Schreibt pro Edition (Versionsgruppe) eine Datei public/dex/<versionsgruppe>.json mit allem, was die
Website für Gegner und eigene Pokémon zeigt, mit den Werten dieser Generation:

  types   {Pokémon: [Typ-IDs]}             Typen in dieser Generation (z. B. Pixie erst ab Gen 6)
  stats   {Pokémon: [KP, Ang, Vert, SpAng, SpVert, Init]}
  learn   {Pokémon: [[Level, Attacke], ...]} per Levelaufstieg
  moves   {Attacke: [Name, Typ, Kategorie, Stärke, Genauigkeit, AP]}  Kategorie: 0 Status, 1 physisch, 2 speziell
  evos    {Pokémon: [[Entwicklung, "Lv. 16"], ...]}

Einmalig bzw. bei neuen Daten ausführen (nur Standardbibliothek):
  python3 tools/generate_dex.py
"""

from __future__ import annotations

import csv
import io
import json
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "dex"
CSV_BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv"
DE = "6"
MAX_SPECIES = 1025

# Editionen, für die es Level-Caps gibt (src/data/levelCaps.ts)
VERSION_GROUPS = [
    "red-blue", "firered-leafgreen", "crystal", "heartgold-soulsilver", "emerald",
    "omega-ruby-alpha-sapphire", "diamond-pearl", "platinum", "black-white", "black-2-white-2", "x-y",
]

TYPE_DE = {
    1: "Normal", 2: "Kampf", 3: "Flug", 4: "Gift", 5: "Boden", 6: "Gestein", 7: "Käfer", 8: "Geist", 9: "Stahl",
    10: "Feuer", 11: "Wasser", 12: "Pflanze", 13: "Elektro", 14: "Psycho", 15: "Eis", 16: "Drache", 17: "Unlicht",
    18: "Fee",
}
# Vor Gen 4 hing physisch/speziell am Typ der Attacke
PHYSICAL_TYPES = {1, 2, 3, 4, 5, 6, 7, 8, 9}


def load(name: str) -> list[dict[str, str]]:
    cache = Path("/tmp") / f"pokeapi-{name}.csv"
    if not cache.exists():
        with urllib.request.urlopen(f"{CSV_BASE}/{name}.csv") as response:
            cache.write_bytes(response.read())
    return list(csv.DictReader(io.StringIO(cache.read_text(encoding="utf-8"))))


def num(value: str) -> int | None:
    return int(value) if value not in ("", None) else None


def main() -> None:
    version_groups = {r["identifier"]: r for r in load("version_groups")}
    vg_order = {r["id"]: int(r["order"]) for r in version_groups.values()}
    species = {int(r["id"]): r for r in load("pokemon_species") if int(r["id"]) <= MAX_SPECIES}
    species_names = {int(r["pokemon_species_id"]): r["name"] for r in load("pokemon_species_names") if r["local_language_id"] == DE}
    moves = {r["id"]: r for r in load("moves")}
    move_names = {r["move_id"]: r["name"] for r in load("move_names") if r["local_language_id"] == DE}
    changelog = defaultdict(list)
    for r in load("move_changelog"):
        changelog[r["move_id"]].append(r)
    item_names = {r["item_id"]: r["name"] for r in load("item_names") if r["local_language_id"] == DE}
    location_names = {r["location_id"]: r["name"] for r in load("location_names") if r["local_language_id"] == DE}
    location_region = {r["id"]: r["region_id"] for r in load("locations")}
    vg_regions: dict[str, set[str]] = defaultdict(set)
    for r in load("version_group_regions"):
        vg_regions[r["version_group_id"]].add(r["region_id"])

    stats: dict[int, list[int]] = defaultdict(lambda: [0] * 6)
    for r in load("pokemon_stats"):
        pid = int(r["pokemon_id"])
        if pid <= MAX_SPECIES and int(r["stat_id"]) <= 6:
            stats[pid][int(r["stat_id"]) - 1] = int(r["base_stat"])
    types: dict[int, list[int]] = defaultdict(list)
    for r in sorted(load("pokemon_types"), key=lambda r: int(r["slot"])):
        if int(r["pokemon_id"]) <= MAX_SPECIES:
            types[int(r["pokemon_id"])].append(int(r["type_id"]))
    # generation_id = letzte Generation, in der das Pokémon diese Typen hatte
    past_types: dict[int, dict[int, list[int]]] = defaultdict(lambda: defaultdict(list))
    for r in sorted(load("pokemon_types_past"), key=lambda r: int(r["slot"])):
        past_types[int(r["pokemon_id"])][int(r["generation_id"])].append(int(r["type_id"]))

    learnsets: dict[str, dict[int, list[tuple[int, int]]]] = defaultdict(lambda: defaultdict(list))
    wanted = {version_groups[v]["id"]: v for v in VERSION_GROUPS}
    for r in load("pokemon_moves"):
        vg = wanted.get(r["version_group_id"])
        pid = int(r["pokemon_id"])
        if vg and pid <= MAX_SPECIES and r["pokemon_move_method_id"] == "1":
            learnsets[vg][pid].append((int(r["level"] or 0), int(r["move_id"])))

    evolutions = load("pokemon_evolution")

    OUT.mkdir(parents=True, exist_ok=True)
    for vg in VERSION_GROUPS:
        info = version_groups[vg]
        gen = int(info["generation_id"])
        order = int(info["order"])
        in_game = [sid for sid, s in species.items() if int(s["generation_id"]) <= gen]

        def types_in(pid: int) -> list[int]:
            older = sorted(g for g in past_types.get(pid, {}) if g >= gen)
            return past_types[pid][older[0]] if older else types[pid]

        def move_in(mid: str) -> list:
            m = moves[mid]
            values = {k: m[k] for k in ("type_id", "power", "accuracy", "pp")}
            # Changelog: Werte vor der Änderung; die früheste Änderung nach dieser Edition gilt
            later = sorted((c for c in changelog.get(mid, []) if vg_order[c["changed_in_version_group_id"]] > order),
                           key=lambda c: vg_order[c["changed_in_version_group_id"]], reverse=True)
            for c in later:
                for k in values:
                    if c.get(k):
                        values[k] = c[k]
            type_id = int(values["type_id"])
            category = int(m["damage_class_id"]) - 1  # 1 Status, 2 physisch, 3 speziell → 0, 1, 2
            if gen <= 3 and category != 0:
                category = 1 if type_id in PHYSICAL_TYPES else 2
            if gen < 6 and type_id == 18:
                type_id = 1
            name = move_names.get(mid) or m["identifier"].replace("-", " ").title()
            return [name, type_id, category, num(values["power"]), num(values["accuracy"]), num(values["pp"])]

        learn = {}
        used_moves: set[int] = set()
        for pid in in_game:
            entries = sorted(set(learnsets[vg].get(pid, [])))
            if entries:
                learn[pid] = [[lvl, mid] for lvl, mid in entries]
                used_moves.update(mid for _, mid in entries)

        def describe(r: dict[str, str]) -> str:
            parts: list[str] = []
            trigger = r["evolution_trigger_id"]
            if trigger == "3":
                parts.append(item_names.get(r["trigger_item_id"], "Item"))
            elif trigger == "2":
                parts.append("Tausch")
                if r["held_item_id"]:
                    parts.append(f"mit {item_names.get(r['held_item_id'], 'Item')}")
                if r["trade_species_id"]:
                    parts.append(f"gegen {species_names.get(int(r['trade_species_id']), '?')}")
            elif trigger == "1":
                if r["minimum_level"]:
                    parts.append(f"Lv. {r['minimum_level']}")
                if r["minimum_happiness"]:
                    parts.append("Freundschaft")
                if r["minimum_affection"]:
                    parts.append("Zuneigung")
                if r["minimum_beauty"]:
                    parts.append("Schönheit")
                if r["held_item_id"]:
                    parts.append(f"trägt {item_names.get(r['held_item_id'], 'Item')}")
                if r["known_move_id"]:
                    parts.append(f"kennt {move_names.get(r['known_move_id'], 'Attacke')}")
                if r["known_move_type_id"]:
                    parts.append(f"kennt {TYPE_DE[int(r['known_move_type_id'])]}-Attacke")
                if r["location_id"]:
                    parts.append(f"bei {location_names.get(r['location_id'], 'besonderem Ort')}")
                if r["party_species_id"]:
                    parts.append(f"mit {species_names.get(int(r['party_species_id']), '?')} im Team")
                if r["party_type_id"]:
                    parts.append(f"mit {TYPE_DE[int(r['party_type_id'])]}-Pokémon im Team")
                stat = r["relative_physical_stats"]
                if stat:
                    parts.append({"1": "Ang > Vert", "-1": "Ang < Vert", "0": "Ang = Vert"}[stat])
                if r["needs_overworld_rain"] == "1":
                    parts.append("bei Regen")
                if r["turn_upside_down"] == "1":
                    parts.append("Gerät umdrehen")
                if not parts:
                    parts.append("Levelaufstieg")
            elif trigger == "4":
                parts.append("Lv. 20 mit freiem Platz und Pokéball")
            else:
                parts.append("besondere Bedingung")
            if r["time_of_day"]:
                parts.append({"day": "tagsüber", "night": "nachts", "dusk": "abends"}.get(r["time_of_day"], r["time_of_day"]))
            if r["gender_id"]:
                parts.append({"1": "weiblich", "2": "männlich"}.get(r["gender_id"], ""))
            return ", ".join(p for p in parts if p)

        evos: dict[int, list[list]] = defaultdict(list)
        by_target: dict[int, list[dict[str, str]]] = defaultdict(list)
        for r in evolutions:
            by_target[int(r["evolved_species_id"])].append(r)
        for target, rows in by_target.items():
            s = species.get(target)
            if not s or int(s["generation_id"]) > gen or not s["evolves_from_species_id"]:
                continue
            # Ortsgebundene Entwicklungen nur, wenn der Ort in dieser Edition liegt
            rows = [r for r in rows if not r["location_id"] or location_region.get(r["location_id"]) in vg_regions[info["id"]]]
            # Editionsspezifische Regeln: genau diese Edition, sonst die letzte davor, sonst die allgemeine
            exact = [r for r in rows if r["version_group_id"] == info["id"]]
            older = [r for r in rows if r["version_group_id"] and vg_order[r["version_group_id"]] <= order]
            general = [r for r in rows if not r["version_group_id"]]
            if exact:
                chosen = exact
            elif older:
                newest = max(vg_order[r["version_group_id"]] for r in older)
                chosen = [r for r in older if vg_order[r["version_group_id"]] == newest]
            else:
                chosen = general
            if not chosen:
                continue
            text = " oder ".join(dict.fromkeys(describe(r) for r in chosen))
            evos[int(s["evolves_from_species_id"])].append([target, text])

        data = {
            "versionGroup": vg,
            "generation": gen,
            "types": {pid: types_in(pid) for pid in in_game},
            "stats": {pid: stats[pid] for pid in in_game},
            "learn": learn,
            "moves": {mid: move_in(str(mid)) for mid in sorted(used_moves)},
            "evos": evos,
        }
        path = OUT / f"{vg}.json"
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"{path.relative_to(ROOT)}: {len(in_game)} Pokémon, {len(used_moves)} Attacken, {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
