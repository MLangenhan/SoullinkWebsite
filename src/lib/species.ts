import { db } from '@/lib/supabase'
import type { Species } from '@/lib/types'

const SHOWDOWN = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown'

export interface SpeciesIndex {
  list: Species[]
  byId: Map<number, Species>
  /** Alle Arten derselben Entwicklungsreihe, nach Stufe sortiert */
  chain: (id: number) => Species[]
  search: (query: string, limit?: number) => Species[]
}

let cache: Promise<SpeciesIndex> | null = null

/** Normalisiert für die Suche: klein, ohne Akzente, ♀/♂ ausgeschrieben */
export function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/♀/g, 'f')
    .replace(/♂/g, 'm')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/** Lädt die Stammdaten einmal pro Sitzung (die API liefert höchstens 1000 Zeilen pro Abfrage). */
export function loadSpecies(): Promise<SpeciesIndex> {
  cache ??= (async () => {
    const list: Species[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db().from('species').select('*').order('id').range(from, from + 999)
      if (error) throw new Error(error.message)
      list.push(...(data as Species[]))
      if (data.length < 1000) break
    }
    return buildIndex(list)
  })().catch((error) => {
    cache = null
    throw error
  })
  return cache
}

function buildIndex(list: Species[]): SpeciesIndex {
  const byId = new Map(list.map((s) => [s.id, s]))
  const chains = new Map<number, Species[]>()
  for (const s of list) {
    const members = chains.get(s.evolution_chain_id) ?? []
    members.push(s)
    chains.set(s.evolution_chain_id, members)
  }
  for (const members of chains.values()) members.sort((a, b) => a.evolution_stage - b.evolution_stage || a.id - b.id)
  const keys = list.map((s) => ({ s, de: normalize(s.name_de), en: normalize(s.name_en) }))

  return {
    list,
    byId,
    chain: (id) => chains.get(byId.get(id)?.evolution_chain_id ?? -1) ?? [],
    search: (query, limit = 8) => {
      const q = normalize(query)
      if (!q) return []
      const number = /^\d+$/.test(query.trim()) ? Number(query.trim()) : null
      const scored: { s: Species; score: number }[] = []
      for (const { s, de, en } of keys) {
        let score = -1
        if (number !== null && s.id === number) score = 0
        else if (de.startsWith(q)) score = 1
        else if (en.startsWith(q)) score = 2
        else if (de.includes(q)) score = 3
        else if (en.includes(q)) score = 4
        if (score >= 0) scored.push({ s, score })
      }
      return scored.sort((a, b) => a.score - b.score || a.s.id - b.s.id).slice(0, limit).map((x) => x.s)
    },
  }
}

/** Animiertes Sprite (Showdown-GIF); für ein paar neue Arten gibt es nur das statische Bild. */
export function animatedSpriteUrl(id: number) {
  return `${SHOWDOWN}/${id}.gif`
}
