#!/usr/bin/env python3
"""Erzeugt die Pokédex-Daten der Website aus den CSV-Dateien von PokeAPI.

Schreibt pro Edition (Versionsgruppe) eine Datei public/dex/<versionsgruppe>.json mit allem, was die
Website für Gegner und eigene Pokémon zeigt, mit den Werten dieser Generation:

  types   {Pokémon: [Typ-IDs]}             Typen in dieser Generation (z. B. Pixie erst ab Gen 6)
  stats   {Pokémon: [KP, Ang, Vert, SpAng, SpVert, Init]}
  learn   {Pokémon: [[Level, Attacke], ...]} per Levelaufstieg
  moves   {Attacke: [Name, Typ, Kategorie, Stärke, Genauigkeit, AP, englischer Name]}
          Kategorie: 0 Status, 1 physisch, 2 speziell
  evos    {Pokémon: [[Entwicklung, "Lv. 16", "Lv. 16"], ...]}  Bedingung deutsch und englisch

Dazu public/dex/names.json: deutsche Namen von Attacken, Fähigkeiten, Items und Wesen, Schlüssel wie
in @smogon/calc (englischer Name ohne Sonderzeichen, klein), für den Schadensrechner.

Einmalig bzw. bei neuen Daten ausführen (nur Standardbibliothek):
  python3 tools/generate_dex.py
"""

from __future__ import annotations

import csv
import io
import json
import re
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "dex"
CSV_BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv"
DE = "6"
EN = "9"
MAX_SPECIES = 1025

# Editionen, für die es Level-Caps gibt (src/data/levelCaps.ts)
VERSION_GROUPS = [
    "red-blue", "firered-leafgreen", "crystal", "heartgold-soulsilver", "emerald",
    "omega-ruby-alpha-sapphire", "diamond-pearl", "platinum", "black-white", "black-2-white-2", "x-y",
]

TYPE_EN = {
    1: "Normal", 2: "Fighting", 3: "Flying", 4: "Poison", 5: "Ground", 6: "Rock", 7: "Bug", 8: "Ghost", 9: "Steel",
    10: "Fire", 11: "Water", 12: "Grass", 13: "Electric", 14: "Psychic", 15: "Ice", 16: "Dragon", 17: "Dark", 18: "Fairy",
}
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


def to_id(name: str) -> str:
    """Wie toID in @smogon/calc"""
    return re.sub(r"[^a-z0-9]+", "", name.lower())


# Texte für Entwicklungsbedingungen
LABELS = {
    "de": {
        "trade": "Tausch", "with": "mit {}", "for": "gegen {}", "level": "Lv. {}", "happiness": "Freundschaft",
        "affection": "Zuneigung", "beauty": "Schönheit", "holds": "trägt {}", "knows": "kennt {}",
        "knows_type": "kennt {}-Attacke", "at": "bei {}", "party": "mit {} im Team", "party_type": "mit {}-Pokémon im Team",
        "stats": {"1": "Ang > Vert", "-1": "Ang < Vert", "0": "Ang = Vert"}, "rain": "bei Regen",
        "upside_down": "Gerät umdrehen", "level_up": "Levelaufstieg", "shed": "Lv. 20 mit freiem Platz und Pokéball",
        "special": "besondere Bedingung", "time": {"day": "tagsüber", "night": "nachts", "dusk": "abends"},
        "gender": {"1": "weiblich", "2": "männlich"}, "or": " oder ", "item": "Item", "move": "Attacke",
        "place": "besonderem Ort",
    },
    "en": {
        "trade": "Trade", "with": "holding {}", "for": "for {}", "level": "Lv. {}", "happiness": "Friendship",
        "affection": "Affection", "beauty": "Beauty", "holds": "holding {}", "knows": "knows {}",
        "knows_type": "knows a {} move", "at": "at {}", "party": "with {} in party", "party_type": "with a {} Pokémon in party",
        "stats": {"1": "Atk > Def", "-1": "Atk < Def", "0": "Atk = Def"}, "rain": "in rain",
        "upside_down": "turn console upside down", "level_up": "Level up", "shed": "Lv. 20 with free slot and Poké Ball",
        "special": "special condition", "time": {"day": "during the day", "night": "at night", "dusk": "at dusk"},
        "gender": {"1": "female", "2": "male"}, "or": " or ", "item": "Item", "move": "Move", "place": "special place",
    },
}


def num(value: str) -> int | None:
    return int(value) if value not in ("", None) else None


def main() -> None:
    version_groups = {r["identifier"]: r for r in load("version_groups")}
    vg_order = {r["id"]: int(r["order"]) for r in version_groups.values()}
    species = {int(r["id"]): r for r in load("pokemon_species") if int(r["id"]) <= MAX_SPECIES}
    def names(table: str, key: str) -> dict[str, dict[str, str]]:
        rows = load(table)
        return {
            lang: {r[key]: r["name"] for r in rows if r["local_language_id"] == lid}
            for lang, lid in (("de", DE), ("en", EN))
        }

    species_names = {lang: {int(k): v for k, v in table.items()} for lang, table in names("pokemon_species_names", "pokemon_species_id").items()}
    moves = {r["id"]: r for r in load("moves")}
    move_names = names("move_names", "move_id")
    changelog = defaultdict(list)
    for r in load("move_changelog"):
        changelog[r["move_id"]].append(r)
    item_names = names("item_names", "item_id")
    location_names = names("location_names", "location_id")
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
            fallback = m["identifier"].replace("-", " ").title()
            name = move_names["de"].get(mid) or move_names["en"].get(mid) or fallback
            return [name, type_id, category, num(values["power"]), num(values["accuracy"]), num(values["pp"]),
                    move_names["en"].get(mid) or fallback]

        learn = {}
        used_moves: set[int] = set()
        for pid in in_game:
            entries = sorted(set(learnsets[vg].get(pid, [])))
            if entries:
                learn[pid] = [[lvl, mid] for lvl, mid in entries]
                used_moves.update(mid for _, mid in entries)

        def describe(r: dict[str, str], lang: str) -> str:
            L = LABELS[lang]
            items, moves_l, places, species_l = item_names[lang], move_names[lang], location_names[lang], species_names[lang]
            type_names = TYPE_DE if lang == "de" else TYPE_EN
            parts: list[str] = []
            trigger = r["evolution_trigger_id"]
            if trigger == "3":
                parts.append(items.get(r["trigger_item_id"], L["item"]))
            elif trigger == "2":
                parts.append(L["trade"])
                if r["held_item_id"]:
                    parts.append(L["with"].format(items.get(r["held_item_id"], L["item"])))
                if r["trade_species_id"]:
                    parts.append(L["for"].format(species_l.get(int(r["trade_species_id"]), "?")))
            elif trigger == "1":
                if r["minimum_level"]:
                    parts.append(L["level"].format(r["minimum_level"]))
                if r["minimum_happiness"]:
                    parts.append(L["happiness"])
                if r["minimum_affection"]:
                    parts.append(L["affection"])
                if r["minimum_beauty"]:
                    parts.append(L["beauty"])
                if r["held_item_id"]:
                    parts.append(L["holds"].format(items.get(r["held_item_id"], L["item"])))
                if r["known_move_id"]:
                    parts.append(L["knows"].format(moves_l.get(r["known_move_id"], L["move"])))
                if r["known_move_type_id"]:
                    parts.append(L["knows_type"].format(type_names[int(r["known_move_type_id"])]))
                if r["location_id"]:
                    parts.append(L["at"].format(places.get(r["location_id"], L["place"])))
                if r["party_species_id"]:
                    parts.append(L["party"].format(species_l.get(int(r["party_species_id"]), "?")))
                if r["party_type_id"]:
                    parts.append(L["party_type"].format(type_names[int(r["party_type_id"])]))
                stat = r["relative_physical_stats"]
                if stat:
                    parts.append(L["stats"][stat])
                if r["needs_overworld_rain"] == "1":
                    parts.append(L["rain"])
                if r["turn_upside_down"] == "1":
                    parts.append(L["upside_down"])
                if not parts:
                    parts.append(L["level_up"])
            elif trigger == "4":
                parts.append(L["shed"])
            else:
                parts.append(L["special"])
            if r["time_of_day"]:
                parts.append(L["time"].get(r["time_of_day"], r["time_of_day"]))
            if r["gender_id"]:
                parts.append(L["gender"].get(r["gender_id"], ""))
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
            texts = [LABELS[lang]["or"].join(dict.fromkeys(describe(r, lang) for r in chosen)) for lang in ("de", "en")]
            evos[int(s["evolves_from_species_id"])].append([target, *texts])

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

    # Deutsche Namen für den Schadensrechner (Schlüssel: englischer Name wie toID in @smogon/calc)
    def german(table: str, key: str) -> dict[str, str]:
        n = names(table, key)
        return {to_id(en): n["de"][k] for k, en in n["en"].items() if k in n["de"]}

    extra = {
        "moves": {to_id(en): move_names["de"][k] for k, en in move_names["en"].items() if k in move_names["de"]},
        "abilities": german("ability_names", "ability_id"),
        "items": german("item_names", "item_id"),
        "natures": german("nature_names", "nature_id"),
    }
    path = OUT / "names.json"
    path.write_text(json.dumps(extra, ensure_ascii=False, separators=(",", ":"), sort_keys=True), encoding="utf-8")
    print(f"{path.relative_to(ROOT)}: {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
