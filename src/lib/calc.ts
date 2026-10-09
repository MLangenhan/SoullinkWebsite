// Schadensrechner auf Basis von @smogon/calc (wie der Showdown-Calc). Wird nur im Calc-Tab geladen.
import { calculate, Field, Generations, Move, Pokemon, toID, type GenerationNum } from '@smogon/calc'
import { getLang } from '@/lib/i18n'
import { withBase } from '@/lib/router'
import { normalize } from '@/lib/species'

export const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const
export type StatKey = (typeof STATS)[number]
export type Stats = Record<StatKey, number>

export interface SideConfig {
  speciesId: number | null
  level: number
  nature: string
  ability: string
  item: string
  ivs: Stats
  evs: Stats
  boosts: Record<Exclude<StatKey, 'hp'>, number>
  status: '' | 'brn' | 'par' | 'psn' | 'tox' | 'slp' | 'frz'
  hpPercent: number
  /** Englische Attackennamen wie in @smogon/calc */
  moves: string[]
  /** Randomizer: eigene Typen und Basiswerte statt der Originaldaten */
  override: { enabled: boolean; types: string[]; stats: Stats }
}

export interface FieldConfig {
  weather: '' | 'Sun' | 'Rain' | 'Sand' | 'Hail'
  crit: boolean
  /** Reflektor/Lichtschild auf der Seite des Verteidigers: links bzw. rechts */
  screens: { left: { reflect: boolean; lightScreen: boolean }; right: { reflect: boolean; lightScreen: boolean } }
}

const flat = (value: number): Stats => ({ hp: value, atk: value, def: value, spa: value, spd: value, spe: value })

export function emptySide(level = 50): SideConfig {
  return {
    speciesId: null,
    level,
    nature: 'Hardy',
    ability: '',
    item: '',
    ivs: flat(31),
    evs: flat(0),
    boosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    status: '',
    hpPercent: 100,
    moves: ['', '', '', ''],
    override: { enabled: false, types: [], stats: flat(50) },
  }
}

export function emptyField(): FieldConfig {
  return {
    weather: '',
    crit: false,
    screens: { left: { reflect: false, lightScreen: false }, right: { reflect: false, lightScreen: false } },
  }
}

interface Names {
  moves: Record<string, string>
  abilities: Record<string, string>
  items: Record<string, string>
  natures: Record<string, string>
}

let namesPromise: Promise<Names> | null = null
export function loadNames(): Promise<Names> {
  namesPromise ??= fetch(withBase('/dex/names.json')).then((r) => {
    if (!r.ok) throw new Error(`names.json ${r.status}`)
    return r.json() as Promise<Names>
  })
  namesPromise.catch(() => (namesPromise = null))
  return namesPromise
}

/** Anzeigename (deutsch aus names.json, sonst englisch) */
export function label(names: Names | null, kind: keyof Names, english: string) {
  if (!english) return ''
  return getLang() === 'de' ? (names?.[kind][toID(english)] ?? english) : english
}

export interface CalcGen {
  num: GenerationNum
  /** Name in @smogon/calc zu unserem Pokémon (über den englischen Namen) */
  speciesName: (nameEn: string) => string | null
  species: (name: string) => { types: string[]; baseStats: Stats; abilities: string[] } | null
  moves: string[]
  abilities: string[]
  items: string[]
  natures: { name: string; plus?: string; minus?: string }[]
  moveInfo: (name: string) => { type: string; category: string; basePower: number } | null
}

const gens = new Map<number, CalcGen>()

export function generation(num: number): CalcGen {
  const n = Math.min(9, Math.max(1, num)) as GenerationNum
  const cached = gens.get(n)
  if (cached) return cached
  const gen = Generations.get(n)
  const byId = new Map<string, string>()
  for (const s of gen.species) byId.set(s.id, s.name)
  const result: CalcGen = {
    num: n,
    speciesName: (nameEn) => byId.get(normalize(nameEn)) ?? null,
    species: (name) => {
      const s = gen.species.get(toID(name))
      if (!s) return null
      return { types: [...s.types], baseStats: { ...s.baseStats } as Stats, abilities: Object.values(s.abilities ?? {}) as string[] }
    },
    moves: [...gen.moves].filter((m) => m.name !== '(No Move)').map((m) => m.name).sort(),
    abilities: [...gen.abilities].map((a) => a.name).sort(),
    items: [...gen.items].map((i) => i.name).sort(),
    natures: [...gen.natures].map((nature) => ({ name: nature.name, plus: nature.plus, minus: nature.minus })),
    moveInfo: (name) => {
      const m = gen.moves.get(toID(name))
      return m ? { type: m.type, category: m.category ?? 'Status', basePower: m.basePower } : null
    },
  }
  gens.set(n, result)
  return result
}

function pokemon(gen: CalcGen, name: string, side: SideConfig) {
  const options: ConstructorParameters<typeof Pokemon>[2] = {
    level: side.level,
    status: side.status,
    boosts: side.boosts,
  }
  if (gen.num >= 3) {
    options.nature = side.nature
    options.ivs = side.ivs
    options.evs = side.evs
    if (side.ability) options.ability = side.ability
  }
  if (gen.num >= 2 && side.item) options.item = side.item
  const types = side.override.enabled ? side.override.types.filter(Boolean) : []
  if (side.override.enabled) {
    options.overrides = {
      types: (types.length ? types : undefined) as never,
      baseStats: side.override.stats,
    }
  }
  const mon = new Pokemon(gen.num, name, options)
  mon.originalCurHP = Math.max(1, Math.round((mon.maxHP() * side.hpPercent) / 100))
  return types.length ? withTypes(mon, types) : mon
}

/**
 * Randomizer-Typen fest setzen: @smogon/calc verschmilzt Typlisten Eintrag für Eintrag mit den Originaldaten
 * (auch beim Klonen in calculate), aus „nur Wasser“ für Knakrack würde sonst „Wasser/Boden“.
 */
function withTypes(mon: Pokemon, types: string[]): Pokemon {
  const fixed = mon as unknown as { types: string[]; species: { types: string[] }; clone: () => Pokemon }
  fixed.types = [...types]
  fixed.species.types = [...types]
  const clone = mon.clone.bind(mon)
  fixed.clone = () => withTypes(clone(), types)
  return mon
}

export interface MoveResult {
  move: string
  min: number
  max: number
  minPercent: number
  maxPercent: number
  hp: number
  maxHp: number
  ko: { n: number; chance: number | undefined }
  status: boolean
}

export interface CalcOutcome {
  leftToRight: MoveResult[]
  rightToLeft: MoveResult[]
  leftSpeed: number
  rightSpeed: number
}

/** Beide Richtungen: jede Attacke links gegen rechts und umgekehrt */
export function compute(gen: CalcGen, leftName: string, left: SideConfig, rightName: string, right: SideConfig, field: FieldConfig): CalcOutcome {
  const a = pokemon(gen, leftName, left)
  const b = pokemon(gen, rightName, right)
  const fieldFor = (defender: 'left' | 'right') =>
    new Field({
      gameType: 'Singles',
      weather: field.weather ? (field.weather as never) : undefined,
      defenderSide: {
        isReflect: field.screens[defender].reflect,
        isLightScreen: field.screens[defender].lightScreen,
      },
    })
  const run = (attacker: Pokemon, defender: Pokemon, moves: string[], defenderSide: 'left' | 'right') =>
    moves.filter(Boolean).map((name): MoveResult => {
      const move = new Move(gen.num, name, { isCrit: field.crit })
      const result = calculate(gen.num, attacker, defender, move, fieldFor(defenderSide))
      const [min, max] = result.range()
      const maxHp = defender.maxHP()
      const status = move.category === 'Status' || max === 0
      const ko = status ? { n: 0, chance: 0 } : result.kochance(false)
      return {
        move: name,
        min,
        max,
        minPercent: (min / maxHp) * 100,
        maxPercent: (max / maxHp) * 100,
        hp: defender.curHP(),
        maxHp,
        ko: { n: ko.n, chance: ko.chance },
        status,
      }
    })
  return {
    leftToRight: run(a, b, left.moves, 'right'),
    rightToLeft: run(b, a, right.moves, 'left'),
    leftSpeed: a.stats.spe,
    rightSpeed: b.stats.spe,
  }
}
