#!/usr/bin/env python3
"""Erzeugt die Pokémon-Stammdaten aus den CSV-Dateien von PokeAPI.

Schreibt:
  data/species.json                                     für Migration, Bot und Frontend
  supabase/migrations/20261008120100_species.sql        Upsert in public.species

Einmalig bzw. bei neuen Pokémon-Generationen ausführen:
  python3 tools/generate_species.py

Nur Standardbibliothek. Quelle: https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv
"""

from __future__ import annotations

import csv
import io
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv"
SPRITE_URL = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/{id}.png"
LANGUAGE_DE = "6"
LANGUAGE_EN = "9"
MIGRATION = ROOT / "supabase" / "migrations" / "20261008120100_species.sql"
JSON_OUT = ROOT / "data" / "species.json"


def fetch_csv(name: str) -> list[dict[str, str]]:
    with urllib.request.urlopen(f"{CSV_BASE}/{name}.csv", timeout=60) as response:
        text = response.read().decode("utf-8")
    return list(csv.DictReader(io.StringIO(text)))


def build_species() -> list[dict]:
    species_rows = fetch_csv("pokemon_species")
    name_rows = fetch_csv("pokemon_species_names")

    names: dict[str, dict[str, str]] = {}
    for row in name_rows:
        if row["local_language_id"] in (LANGUAGE_DE, LANGUAGE_EN):
            names.setdefault(row["pokemon_species_id"], {})[row["local_language_id"]] = row["name"]

    evolves_from = {row["id"]: row["evolves_from_species_id"] or None for row in species_rows}

    def stage(species_id: str) -> int:
        depth = 1
        parent = evolves_from[species_id]
        while parent:
            depth += 1
            parent = evolves_from[parent]
        return depth

    result = []
    for row in species_rows:
        species_id = row["id"]
        localized = names.get(species_id, {})
        if LANGUAGE_DE not in localized or LANGUAGE_EN not in localized:
            raise SystemExit(f"Name fehlt für #{species_id} ({row['identifier']})")
        result.append(
            {
                "id": int(species_id),
                "slug": row["identifier"],
                "name_en": localized[LANGUAGE_EN],
                "name_de": localized[LANGUAGE_DE],
                "generation": int(row["generation_id"]),
                "evolution_chain_id": int(row["evolution_chain_id"]),
                "evolves_from_id": int(row["evolves_from_species_id"]) if row["evolves_from_species_id"] else None,
                "evolution_stage": stage(species_id),
                "sprite_url": SPRITE_URL.format(id=species_id),
            }
        )
    result.sort(key=lambda s: s["id"])
    return result


def sql_literal(value) -> str:
    if value is None:
        return "null"
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def write_migration(species: list[dict]) -> None:
    columns = [
        "id",
        "slug",
        "name_en",
        "name_de",
        "generation",
        "evolution_chain_id",
        "evolves_from_id",
        "evolution_stage",
        "sprite_url",
    ]
    rows = ",\n".join("  (" + ", ".join(sql_literal(s[c]) for c in columns) + ")" for s in species)
    updates = ",\n  ".join(f"{c} = excluded.{c}" for c in columns if c != "id")
    MIGRATION.write_text(
        "-- Pokémon-Stammdaten (generiert von tools/generate_species.py, nicht von Hand ändern)\n"
        f"-- {len(species)} Arten, Quelle: PokeAPI\n\n"
        f"insert into public.species ({', '.join(columns)}) values\n{rows}\n"
        f"on conflict (id) do update set\n  {updates};\n",
        encoding="utf-8",
    )


def main() -> None:
    species = build_species()
    JSON_OUT.parent.mkdir(parents=True, exist_ok=True)
    # Ein Objekt pro Zeile: kompakt, aber gut lesbare Diffs
    lines = ",\n".join(json.dumps(s, ensure_ascii=False) for s in species)
    JSON_OUT.write_text(f"[\n{lines}\n]\n", encoding="utf-8")
    write_migration(species)
    print(f"{len(species)} Arten geschrieben: {JSON_OUT.relative_to(ROOT)}, {MIGRATION.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
