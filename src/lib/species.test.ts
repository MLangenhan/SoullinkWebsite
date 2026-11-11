import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { dupesOf } from '@/lib/dupes'
import { buildIndex, dexNumber } from '@/lib/species'
import type { Species } from '@/lib/types'
import { encounter } from '@/test/fixtures'

// Stammdaten wie in der Datenbank (tools/generate_species.py), inklusive Regionalformen
const root = path.resolve(import.meta.dirname, '../..')
const all = JSON.parse(readFileSync(path.join(root, 'data/species.json'), 'utf8')) as Species[]
const species = buildIndex(all)
const usum = JSON.parse(readFileSync(path.join(root, 'public/dex/ultra-sun-ultra-moon.json'), 'utf8')) as {
  types: Record<string, number[]>
  evos: Record<string, [number, string, string][]>
}

describe('Regionalformen', () => {
  const alolanRattata = species.byId.get(10091)!

  it('Alola-Formen sind eigene Einträge mit der Nummer der Art', () => {
    expect(alolanRattata.name_en).toBe('Alolan Rattata')
    expect(dexNumber(alolanRattata)).toBe(19)
    expect(all.filter((s) => s.form_of).length).toBe(18)
  })

  it('Suche nach Name oder Nummer findet Art und Form, die Art zuerst', () => {
    expect(species.search('Rattfratz').map((s) => s.id)).toEqual([19, 10091])
    expect(species.search('19').map((s) => s.id)).toEqual([19, 10091])
  })

  it('Form gehört zur Entwicklungsreihe der Art: Entwicklung und Dupes-Regel', () => {
    expect(species.chain(10091).map((s) => s.id)).toEqual([19, 10091, 20, 10092])
    expect(species.byId.get(10100)?.evolves_from_id).toBe(25)
    const caught = [encounter('e1', 'm1', 'l1', { species_id: 19, caught_species_id: 19 })]
    expect(dupesOf(10091, caught, species)).toHaveLength(1)
  })

  it('Ultramond-Pokédex kennt die Typen der Form und Entwicklungen in Alola', () => {
    expect(usum.types['10091']).toEqual([17, 1]) // Unlicht/Normal
    expect(usum.types['19']).toEqual([1])
    expect(usum.evos['25'].map(([id]) => id)).toEqual([10100])
    expect(usum.evos['10091'].map(([id]) => id)).toEqual([10092])
    for (const form of all.filter((s) => s.form_of)) expect(usum.types[form.id], form.slug).toBeDefined()
  })
})
