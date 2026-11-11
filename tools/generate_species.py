#!/usr/bin/env python3
"""Erzeugt die Pokémon-Stammdaten aus den CSV-Dateien von PokeAPI.

Schreibt:
  data/species.json                                     für Migration, Bot und Frontend
  supabase/migrations/20261008120100_species.sql        Upsert in public.species
  supabase/migrations/20261112120000_regional_forms.sql Regionalformen (Alola …) als eigene Einträge

Regionalformen bekommen die PokeAPI-ID der Form (z. B. 10091 für Alola-Rattfratz) und form_of = nationale
Nummer der Art. Sie liegen in derselben Entwicklungsreihe wie die Art, damit Dupes-Regel, Entwicklung und
Sprites ohne Sonderfälle funktionieren.

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
FORMS_MIGRATION = ROOT / "supabase" / "migrations" / "20261112120000_regional_forms.sql"
# Formen, die in Nuzlockes wie eigene Pokémon gefangen werden; generate_dex.py nimmt dieselben auf
REGIONAL_FORMS = {"alola"}
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


def build_forms(species: list[dict]) -> list[dict]:
    """Regionalformen; Vorstufe ist die gleiche Form der Vorstufe, sonst die Art selbst (Pikachu → Alola-Raichu)"""
    by_id = {s["id"]: s for s in species}
    pokemon_species = {r["id"]: int(r["species_id"]) for r in fetch_csv("pokemon")}
    vg_generation = {r["id"]: int(r["generation_id"]) for r in fetch_csv("version_groups")}
    names: dict[str, dict[str, str]] = {}
    for row in fetch_csv("pokemon_form_names"):
        if row["local_language_id"] in (LANGUAGE_DE, LANGUAGE_EN) and row["pokemon_name"]:
            names.setdefault(row["pokemon_form_id"], {})[row["local_language_id"]] = row["pokemon_name"]

    rows = [r for r in fetch_csv("pokemon_forms") if r["form_identifier"] in REGIONAL_FORMS and r["is_battle_only"] == "0"]
    form_of_species = {(pokemon_species[r["pokemon_id"]], r["form_identifier"]): int(r["pokemon_id"]) for r in rows}
    result = []
    for row in rows:
        base = by_id[pokemon_species[row["pokemon_id"]]]
        localized = names.get(row["id"], {})
        if LANGUAGE_DE not in localized or LANGUAGE_EN not in localized:
            raise SystemExit(f"Name fehlt für Form {row['identifier']}")
        parent = base["evolves_from_id"]
        result.append(
            {
                "id": int(row["pokemon_id"]),
                "slug": row["identifier"],
                "name_en": localized[LANGUAGE_EN],
                "name_de": localized[LANGUAGE_DE],
                "generation": vg_generation[row["introduced_in_version_group_id"]],
                "evolution_chain_id": base["evolution_chain_id"],
                "evolves_from_id": form_of_species.get((parent, row["form_identifier"]), parent) if parent else None,
                "evolution_stage": base["evolution_stage"],
                "sprite_url": SPRITE_URL.format(id=row["pokemon_id"]),
                "form_of": base["id"],
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


COLUMNS = [
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


def upsert(species: list[dict], columns: list[str]) -> str:
    rows = ",\n".join("  (" + ", ".join(sql_literal(s[c]) for c in columns) + ")" for s in species)
    updates = ",\n  ".join(f"{c} = excluded.{c}" for c in columns if c != "id")
    return f"insert into public.species ({', '.join(columns)}) values\n{rows}\non conflict (id) do update set\n  {updates};\n"


def write_migration(species: list[dict]) -> None:
    MIGRATION.write_text(
        "-- Pokémon-Stammdaten (generiert von tools/generate_species.py, nicht von Hand ändern)\n"
        f"-- {len(species)} Arten, Quelle: PokeAPI\n\n" + upsert(species, COLUMNS),
        encoding="utf-8",
    )


def write_forms_migration(forms: list[dict]) -> None:
    FORMS_MIGRATION.write_text(
        "-- Regionalformen (generiert von tools/generate_species.py, nicht von Hand ändern)\n"
        f"-- {len(forms)} Formen ({', '.join(sorted(REGIONAL_FORMS))}), Quelle: PokeAPI\n"
        "--\n"
        "-- Eine Regionalform ist ein eigener Eintrag mit der PokeAPI-ID der Form (über 10000) und form_of =\n"
        "-- nationale Nummer der Art. Sie gehört zur selben Entwicklungsreihe: Dupes-Regel und Entwicklung\n"
        "-- behandeln Alola-Rattfratz wie Rattfratz, Sprite und Typen kommen von der Form.\n\n"
        "alter table public.species add column if not exists form_of integer references public.species (id);\n"
        "comment on column public.species.id is 'Nationale Pokédex-Nummer, bei Regionalformen die PokeAPI-ID der Form';\n"
        "comment on column public.species.form_of is 'Bei Regionalformen: nationale Nummer der Art';\n\n"
        + upsert(forms, [*COLUMNS, "form_of"]),
        encoding="utf-8",
    )


def main() -> None:
    species = build_species()
    forms = build_forms(species)
    JSON_OUT.parent.mkdir(parents=True, exist_ok=True)
    # Ein Objekt pro Zeile: kompakt, aber gut lesbare Diffs
    lines = ",\n".join(json.dumps(s, ensure_ascii=False) for s in [*species, *forms])
    JSON_OUT.write_text(f"[\n{lines}\n]\n", encoding="utf-8")
    write_migration(species)
    write_forms_migration(forms)
    print(f"{len(species)} Arten und {len(forms)} Formen geschrieben: {JSON_OUT.relative_to(ROOT)}, "
          f"{MIGRATION.relative_to(ROOT)}, {FORMS_MIGRATION.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
