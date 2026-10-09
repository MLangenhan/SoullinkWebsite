import { useEffect, useState } from 'react'
import { getLang } from '@/lib/i18n'
import { withBase } from '@/lib/router'

/** Pokédex-Daten einer Edition, erzeugt von tools/generate_dex.py (public/dex/<versionGroup>.json) */
export interface DexData {
  versionGroup: string
  generation: number
  types: Record<string, number[]>
  stats: Record<string, number[]>
  learn: Record<string, [number, number][]>
  /** Name, Typ, Kategorie (0 Status, 1 physisch, 2 speziell), Stärke, Genauigkeit, AP, englischer Name */
  moves: Record<string, [string, number, number, number | null, number | null, number | null, string]>
  /** Entwicklung, Bedingung deutsch, Bedingung englisch */
  evos: Record<string, [number, string, string][]>
}

export const VERSION_GROUP_NAMES: Record<string, string> = {
  'red-blue': 'Rot/Blau',
  'firered-leafgreen': 'Feuerrot/Blattgrün',
  crystal: 'Kristall',
  'heartgold-soulsilver': 'HeartGold/SoulSilver',
  emerald: 'Smaragd',
  'omega-ruby-alpha-sapphire': 'Omega Rubin/Alpha Saphir',
  'diamond-pearl': 'Diamant/Perl',
  platinum: 'Platin',
  'black-white': 'Schwarz/Weiß',
  'black-2-white-2': 'Schwarz 2/Weiß 2',
  'x-y': 'X/Y',
}

const cache = new Map<string, Promise<DexData>>()

export function loadDex(versionGroup: string): Promise<DexData> {
  let promise = cache.get(versionGroup)
  if (!promise) {
    promise = fetch(withBase(`/dex/${versionGroup}.json`)).then((response) => {
      if (!response.ok) throw new Error(`Pokédex-Daten fehlen (${response.status})`)
      return response.json() as Promise<DexData>
    })
    promise.catch(() => cache.delete(versionGroup))
    cache.set(versionGroup, promise)
  }
  return promise
}

export function useDex(versionGroup: string): DexData | null {
  const [state, setState] = useState<{ key: string; data: DexData } | null>(null)
  useEffect(() => {
    let active = true
    loadDex(versionGroup)
      .then((data) => active && setState({ key: versionGroup, data }))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [versionGroup])
  return state?.key === versionGroup ? state.data : null
}

export const TYPES: Record<number, { name: string; en: string; color: string }> = {
  1: { name: 'Normal', en: 'Normal', color: '#9fa19f' },
  2: { name: 'Kampf', en: 'Fighting', color: '#ff8000' },
  3: { name: 'Flug', en: 'Flying', color: '#81b9ef' },
  4: { name: 'Gift', en: 'Poison', color: '#9141cb' },
  5: { name: 'Boden', en: 'Ground', color: '#915121' },
  6: { name: 'Gestein', en: 'Rock', color: '#afa981' },
  7: { name: 'Käfer', en: 'Bug', color: '#91a119' },
  8: { name: 'Geist', en: 'Ghost', color: '#704170' },
  9: { name: 'Stahl', en: 'Steel', color: '#60a1b8' },
  10: { name: 'Feuer', en: 'Fire', color: '#e62829' },
  11: { name: 'Wasser', en: 'Water', color: '#2980ef' },
  12: { name: 'Pflanze', en: 'Grass', color: '#3fa129' },
  13: { name: 'Elektro', en: 'Electric', color: '#e8b800' },
  14: { name: 'Psycho', en: 'Psychic', color: '#ef4179' },
  15: { name: 'Eis', en: 'Ice', color: '#3dcef3' },
  16: { name: 'Drache', en: 'Dragon', color: '#5060e1' },
  17: { name: 'Unlicht', en: 'Dark', color: '#624d4e' },
  18: { name: 'Fee', en: 'Fairy', color: '#ef70ef' },
}

// Angreifender Typ → verteidigender Typ → Faktor (nur Abweichungen von 1), Stand ab Gen 6
const CHART: Record<number, Record<number, number>> = {
  1: { 6: 0.5, 8: 0, 9: 0.5 },
  2: { 1: 2, 3: 0.5, 4: 0.5, 6: 2, 7: 0.5, 8: 0, 9: 2, 14: 0.5, 15: 2, 17: 2, 18: 0.5 },
  3: { 2: 2, 6: 0.5, 7: 2, 9: 0.5, 12: 2, 13: 0.5 },
  4: { 4: 0.5, 5: 0.5, 6: 0.5, 8: 0.5, 9: 0, 12: 2, 18: 2 },
  5: { 3: 0, 4: 2, 6: 2, 7: 0.5, 9: 2, 10: 2, 12: 0.5, 13: 2 },
  6: { 2: 0.5, 3: 2, 5: 0.5, 7: 2, 9: 0.5, 10: 2, 15: 2 },
  7: { 2: 0.5, 3: 0.5, 4: 0.5, 8: 0.5, 9: 0.5, 10: 0.5, 12: 2, 14: 2, 17: 2, 18: 0.5 },
  8: { 1: 0, 8: 2, 14: 2, 17: 0.5 },
  9: { 6: 2, 9: 0.5, 10: 0.5, 11: 0.5, 13: 0.5, 15: 2, 18: 2 },
  10: { 6: 0.5, 7: 2, 9: 2, 10: 0.5, 11: 0.5, 12: 2, 15: 2, 16: 0.5 },
  11: { 5: 2, 6: 2, 10: 2, 11: 0.5, 12: 0.5, 16: 0.5 },
  12: { 3: 0.5, 4: 0.5, 5: 2, 6: 2, 7: 0.5, 9: 0.5, 10: 0.5, 11: 2, 12: 0.5, 16: 0.5 },
  13: { 3: 2, 5: 0, 11: 2, 12: 0.5, 13: 0.5, 16: 0.5 },
  14: { 2: 2, 4: 2, 9: 0.5, 14: 0.5, 17: 0 },
  15: { 3: 2, 5: 2, 9: 0.5, 10: 0.5, 11: 0.5, 12: 2, 15: 0.5, 16: 2 },
  16: { 9: 0.5, 16: 2, 18: 0 },
  17: { 2: 0.5, 8: 2, 14: 2, 17: 0.5, 18: 0.5 },
  18: { 2: 2, 4: 0.5, 9: 0.5, 10: 0.5, 16: 2, 17: 2 },
}

/** Faktor eines Angriffstyps gegen einen oder zwei Verteidigungstypen; vor Gen 6 hält Stahl Geist und Unlicht ab */
export function effectiveness(attack: number, defense: number[], generation: number) {
  return defense.reduce((factor, type) => {
    let single = CHART[attack]?.[type] ?? 1
    if (generation < 6 && type === 9 && (attack === 8 || attack === 17)) single = 0.5
    return factor * single
  }, 1)
}

/** Bester Faktor der eigenen Typen (gleichtypige Attacken) gegen einen Gegner */
export function bestStab(attackTypes: number[], defense: number[], generation: number) {
  return Math.max(...attackTypes.map((t) => effectiveness(t, defense, generation)))
}

export const STAT_NAMES = ['KP', 'Angriff', 'Verteidigung', 'Sp.-Angriff', 'Sp.-Vert.', 'Initiative']
export const CATEGORY_NAMES = ['Status', 'Physisch', 'Speziell']

export function pokewikiUrl(nameDe: string) {
  return `https://www.pokewiki.de/${encodeURIComponent(nameDe.replace(/ /g, '_'))}`
}

export function typeName(type: number) {
  const entry = TYPES[type]
  return entry ? (getLang() === 'en' ? entry.en : entry.name) : '?'
}

export function moveName(move: DexData['moves'][string]) {
  return getLang() === 'en' ? move[6] : move[0]
}

export function evoText(entry: [number, string, string]) {
  return getLang() === 'en' ? entry[2] : entry[1]
}
