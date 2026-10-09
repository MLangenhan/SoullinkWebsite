#!/usr/bin/env python3
"""Erzeugt die Gebietslisten der Website aus den CSV-Dateien von PokeAPI.

Schreibt pro Edition (Versionsgruppe wie in generate_dex.py) eine Datei public/areas/<versionsgruppe>.json:

  regions  [[Region deutsch, Region englisch], ...]   Hauptregion zuerst
  areas    [[Region-Index, Name deutsch, Name englisch, Arten, Routennummer], ...]
           Arten: "w" wilde Begegnungen (Gras, Surfer, Angel, Kopfnuss, Zertrümmerer …),
                  "s" Static oder Geschenk, "ws" beides
           Routennummer: Zahl bei "Route 29", sonst 0 (zum Sortieren)

Tausch-Pokémon, umherstreifende Legenden und Gebiete ohne Namen fehlen bewusst: Sie sind keine Orte,
an denen man in einem Nuzlocke seine eine Begegnung hat.

Einmalig bzw. bei neuen Daten ausführen (nur Standardbibliothek):
  python3 tools/generate_areas.py
"""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict

from generate_dex import DE, EN, ROOT, VERSION_GROUPS, load

OUT = ROOT / "public" / "areas"

STATIC_METHODS = {"static", "gift", "gift-egg", "squirt-bottle", "pokeflute", "devon-scope", "island-scan", "only-one"}
IGNORED_METHODS = {"npc-trade", "pokemon-ranger", "roaming-grass", "roaming-water"}


def main() -> None:
    version_groups = {r["identifier"]: r["id"] for r in load("version_groups")}
    versions_of: dict[str, set[str]] = defaultdict(set)
    for r in load("versions"):
        versions_of[r["version_group_id"]].add(r["id"])
    areas = {r["id"]: r["location_id"] for r in load("location_areas")}
    locations = {r["id"]: r for r in load("locations")}
    slot_method = {r["id"]: r["encounter_method_id"] for r in load("encounter_slots")}
    methods = {r["id"]: r["identifier"] for r in load("encounter_methods")}

    def names(table: str, key: str) -> dict[str, dict[str, str]]:
        result: dict[str, dict[str, str]] = defaultdict(dict)
        for r in load(table):
            if r["local_language_id"] in (DE, EN):
                result[r[key]][r["local_language_id"]] = r["name"]
        return result

    location_names = names("location_names", "location_id")
    region_names = names("region_names", "region_id")

    encounters = load("encounters")
    OUT.mkdir(parents=True, exist_ok=True)
    for group in VERSION_GROUPS:
        versions = versions_of[version_groups[group]]
        kinds: dict[str, set[str]] = defaultdict(set)
        for e in encounters:
            if e["version_id"] not in versions:
                continue
            method = methods[slot_method[e["encounter_slot_id"]]]
            if method in IGNORED_METHODS:
                continue
            kinds[areas[e["location_area_id"]]].add("s" if method in STATIC_METHODS else "w")

        usable = {
            lid: k
            for lid, k in kinds.items()
            if location_names[lid].get(DE) and location_names[lid].get(EN) and not locations[lid]["identifier"].startswith("unknown")
        }
        # Hauptregion = die mit den meisten Gebieten (Feuerrot/Blattgrün ist Kanto, obwohl Generation 3).
        # Weitere Regionen nur, wenn man sie wirklich bereist (Kanto in Johto-Spielen), nicht für einzelne
        # Event-Inseln oder Datenfehler mit ein, zwei Orten
        region_count = Counter(locations[lid]["region_id"] for lid in usable)
        region_order = [rid for rid, count in region_count.most_common() if count >= 5]
        usable = {lid: k for lid, k in usable.items() if locations[lid]["region_id"] in region_order}
        regions = [[region_names[rid].get(DE, rid), region_names[rid].get(EN, rid)] for rid in region_order]

        # Orte mit gleichem deutschem Namen zusammenfassen (z. B. zwei Einträge für den Maniac-Tunnel)
        merged: dict[tuple[str, str], list] = {}
        for lid, k in usable.items():
            de, en = location_names[lid][DE], location_names[lid][EN]
            region = region_order.index(locations[lid]["region_id"])
            key = (locations[lid]["region_id"], de.lower())
            if key in merged:
                merged[key][3] |= k
                continue
            number = re.search(r"\bRoute (\d+)\b", en)
            merged[key] = [region, de, en, set(k), int(number.group(1)) if number else 0]
        rows = [[r[0], r[1], r[2], "".join(sorted(r[3], reverse=True)), r[4]] for r in merged.values()]
        # Je Region: erst Routen nach Nummer, dann die übrigen Orte alphabetisch
        rows.sort(key=lambda r: (r[0], r[4] == 0, r[4], r[1].lower()))

        path = OUT / f"{group}.json"
        path.write_text(json.dumps({"versionGroup": group, "regions": regions, "areas": rows}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"{path.relative_to(ROOT)}: {len(rows)} Gebiete in {len(regions)} Region(en)")


if __name__ == "__main__":
    main()
