import { Fragment, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, ExternalLink, Swords } from 'lucide-react'
import { Pokeball } from '@/components/Pokeball'
import { SpeciesPicker } from '@/components/SpeciesPicker'
import { Sprite } from '@/components/Sprite'
import { capLevel, versionGroupFor } from '@/data/levelCaps'
import type { ChallengeData } from '@/hooks/useChallenge'
import {
  bestStab,
  CATEGORY_NAMES,
  effectiveness,
  pokewikiUrl,
  STAT_NAMES,
  TYPES,
  useDex,
  VERSION_GROUP_NAMES,
  type DexData,
} from '@/lib/dex'
import type { SpeciesIndex } from '@/lib/species'
import type { Encounter } from '@/lib/types'
import { cn } from '@/lib/utils'

export function TypeChip({ type, small }: { type: number; small?: boolean }) {
  const t = TYPES[type]
  if (!t) return null
  return (
    <span
      className={cn('label rounded-full font-semibold text-white shadow-sm', small ? 'px-2 py-0.5 text-[0.55rem]' : 'px-2.5 py-1 text-[0.65rem]')}
      style={{ background: t.color }}
    >
      {t.name}
    </span>
  )
}

/**
 * Pokédex für Gegner und eigene Pokémon, mit den Daten der gespielten Edition: Typen, Schwächen,
 * Basiswerte, Level-Attacken (bis zum Level-Cap hervorgehoben), wie das eigene Team dagegen steht,
 * Entwicklungen und ein Link ins PokéWiki.
 */
export function DexPanel({ data, species }: { data: ChallengeData; species: SpeciesIndex | null }) {
  const versionGroup = versionGroupFor(data.challenge)
  const dex = useDex(versionGroup)
  const [speciesId, setSpeciesId] = useState<number | null>(null)
  const cap = capLevel(data.challenge, data.stats.current_run)
  const team = data.encounters.filter((e) => e.state === 'team' && (!data.me || e.member_id === data.me.id))

  if (!species || !dex) return <Pokeball className="py-16" />
  return (
    <div className="grid gap-6">
      <div className="grid gap-3 md:grid-cols-[minmax(0,26rem)_1fr] md:items-end">
        <div className="grid gap-1.5">
          <span className="label text-muted-foreground">Pokémon nachschlagen</span>
          <SpeciesPicker index={species} value={speciesId} onChange={setSpeciesId} />
        </div>
        {team.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="label mr-2 text-muted-foreground">Dein Team</span>
            {team.map((e) => (
              <button
                key={e.encounter_id}
                type="button"
                onClick={() => setSpeciesId(e.species_id)}
                className={cn('rounded-lg p-1 transition-colors hover:bg-secondary', speciesId === e.species_id && 'bg-secondary')}
                title={species.byId.get(e.species_id)?.name_de}
              >
                <Sprite id={e.species_id} name="" size="sm" idle={false} />
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Daten: {VERSION_GROUP_NAMES[versionGroup] ?? versionGroup} (PokéAPI). Bei Randomizern können Typen, Werte und Attacken abweichen.
      </p>
      {speciesId === null ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-14 text-center text-muted-foreground">
          <Swords className="size-6" />
          <p>Gegnerisches Pokémon eintippen: Typen, Schwächen, Werte und Attacken bis zum Level-Cap.</p>
        </div>
      ) : (
        <DexEntry key={speciesId} speciesId={speciesId} dex={dex} species={species} cap={cap} team={team} onPick={setSpeciesId} />
      )}
    </div>
  )
}

function DexEntry({
  speciesId,
  dex,
  species,
  cap,
  team,
  onPick,
}: {
  speciesId: number
  dex: DexData
  species: SpeciesIndex
  cap: number | null
  team: Encounter[]
  onPick: (id: number) => void
}) {
  const entry = species.byId.get(speciesId)
  const types = dex.types[speciesId]
  const stats = dex.stats[speciesId]
  const moves = dex.learn[speciesId] ?? []
  if (!entry) return null
  if (!types || !stats) {
    return (
      <p className="rounded-2xl border border-dashed px-6 py-10 text-center text-muted-foreground">
        {entry.name_de} gibt es in {VERSION_GROUP_NAMES[dex.versionGroup] ?? dex.versionGroup} noch nicht.
      </p>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"
    >
      <div className="grid content-start gap-6">
        <section className="soft-card rounded-2xl p-5">
          <div className="flex items-center gap-4">
            <Sprite id={speciesId} name={entry.name_de} size="xl" />
            <div className="min-w-0">
              <p className="label text-muted-foreground">#{String(speciesId).padStart(4, '0')}</p>
              <h3 className="font-display tracking-tight text-4xl font-extrabold">{entry.name_de}</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {types.map((t) => (
                  <TypeChip key={t} type={t} />
                ))}
              </div>
              <a
                href={pokewikiUrl(entry.name_de)}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                Im PokéWiki öffnen <ExternalLink className="size-3.5" />
              </a>
            </div>
          </div>
          <Stats stats={stats} />
        </section>
        <Matchups types={types} generation={dex.generation} />
        {team.length > 0 && <TeamVersus team={team} types={types} dex={dex} species={species} onPick={onPick} />}
        <section className="soft-card rounded-2xl p-5">
          <h4 className="label mb-3 text-muted-foreground">Entwicklung</h4>
          <EvolutionChain speciesId={speciesId} dex={dex} species={species} onPick={onPick} />
        </section>
      </div>

      <section className="soft-card rounded-2xl p-5">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h4 className="label text-muted-foreground">Attacken per Level</h4>
          {cap !== null && <span className="label text-[0.6rem] text-primary">Level-Cap {cap}</span>}
        </div>
        {moves.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Level-Attacken in dieser Edition.</p>
        ) : (
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[30rem] text-sm">
              <thead>
                <tr className="label text-left text-[0.6rem] text-muted-foreground">
                  <th className="px-2 py-1.5 font-normal">Lv.</th>
                  <th className="px-2 py-1.5 font-normal">Attacke</th>
                  <th className="px-2 py-1.5 font-normal">Typ</th>
                  <th className="px-2 py-1.5 font-normal">Kat.</th>
                  <th className="px-2 py-1.5 text-right font-normal">Stärke</th>
                  <th className="px-2 py-1.5 text-right font-normal">Gen.</th>
                  <th className="px-2 py-1.5 text-right font-normal">AP</th>
                </tr>
              </thead>
              <tbody>
                {moves.map(([level, moveId], i) => {
                  const move = dex.moves[moveId]
                  if (!move) return null
                  const [name, type, category, power, accuracy, pp] = move
                  const reachable = cap === null || level <= cap
                  const firstAbove = cap !== null && level > cap && (i === 0 || moves[i - 1][0] <= cap)
                  return (
                    <Fragment key={`${level}-${moveId}`}>
                      {firstAbove && (
                        <tr>
                          <td colSpan={7} className="px-2 pt-3 pb-1">
                            <span className="label flex items-center gap-2 text-[0.6rem] text-primary">
                              <span className="h-px flex-1 bg-primary/40" /> über Level-Cap {cap} <span className="h-px flex-1 bg-primary/40" />
                            </span>
                          </td>
                        </tr>
                      )}
                      <tr className={cn('border-t border-border/60', !reachable && 'text-muted-foreground opacity-60')}>
                        <td className="px-2 py-1.5 tabular-nums">{level <= 1 ? 'Start' : level}</td>
                        <td className="px-2 py-1.5 font-medium">{name}</td>
                        <td className="px-2 py-1.5">
                          <TypeChip type={type} small />
                        </td>
                        <td className="px-2 py-1.5 text-xs">{CATEGORY_NAMES[category]}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{power ?? '–'}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{accuracy ?? '–'}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{pp ?? '–'}</td>
                      </tr>
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </motion.div>
  )
}

function Stats({ stats }: { stats: number[] }) {
  const total = stats.reduce((a, b) => a + b, 0)
  return (
    <div className="mt-5 grid gap-1.5">
      {stats.map((value, i) => (
        <div key={STAT_NAMES[i]} className="grid grid-cols-[6.5rem_2.5rem_1fr] items-center gap-2 text-sm">
          <span className="text-muted-foreground">{STAT_NAMES[i]}</span>
          <span className="text-right font-medium tabular-nums">{value}</span>
          <span className="h-2 overflow-hidden rounded-full bg-secondary">
            <motion.span
              className="block h-full rounded-full"
              style={{ background: value >= 100 ? 'var(--ok)' : value >= 60 ? 'var(--primary)' : 'var(--destructive)' }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (value / 180) * 100)}%` }}
              transition={{ duration: 0.6, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
            />
          </span>
        </div>
      ))}
      <div className="grid grid-cols-[6.5rem_2.5rem_1fr] gap-2 border-t pt-1.5 text-sm">
        <span className="text-muted-foreground">Summe</span>
        <span className="text-right font-semibold tabular-nums">{total}</span>
      </div>
    </div>
  )
}

/** Schwächen und Resistenzen des Pokémon (Verteidigung) */
function Matchups({ types, generation }: { types: number[]; generation: number }) {
  const all = Object.keys(TYPES)
    .map(Number)
    .filter((t) => generation >= 6 || t !== 18)
    .map((t) => ({ type: t, factor: effectiveness(t, types, generation) }))
  const groups = [
    { label: 'Sehr schwach (×4)', items: all.filter((x) => x.factor === 4) },
    { label: 'Schwach (×2)', items: all.filter((x) => x.factor === 2) },
    { label: 'Resistent (×½)', items: all.filter((x) => x.factor === 0.5) },
    { label: 'Sehr resistent (×¼)', items: all.filter((x) => x.factor === 0.25) },
    { label: 'Immun (×0)', items: all.filter((x) => x.factor === 0) },
  ].filter((g) => g.items.length)
  return (
    <section className="soft-card rounded-2xl p-5">
      <h4 className="label mb-3 text-muted-foreground">Schwächen und Resistenzen</h4>
      <dl className="grid gap-2.5">
        {groups.map((g) => (
          <div key={g.label} className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:items-center">
            <dt className="text-sm text-muted-foreground">{g.label}</dt>
            <dd className="flex flex-wrap gap-1">
              {g.items.map((x) => (
                <TypeChip key={x.type} type={x.type} small />
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

const factorLabel = (f: number) => (f === 0.5 ? '×½' : f === 0.25 ? '×¼' : `×${f}`)
const factorClass = (f: number) => (f >= 2 ? 'bg-ok/15 text-ok' : f < 1 ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-muted-foreground')

/** Wie das eigene Team gegen dieses Pokémon steht (gleichtypige Attacken in beide Richtungen) */
function TeamVersus({
  team,
  types,
  dex,
  species,
  onPick,
}: {
  team: Encounter[]
  types: number[]
  dex: DexData
  species: SpeciesIndex
  onPick: (id: number) => void
}) {
  const rows = team
    .map((e) => {
      const own = dex.types[e.species_id] ?? []
      return { e, own, attack: own.length ? bestStab(own, types, dex.generation) : 1, defense: bestStab(types, own, dex.generation) }
    })
    .sort((a, b) => b.attack - a.attack || a.defense - b.defense)
  return (
    <section className="soft-card rounded-2xl p-5">
      <h4 className="label mb-1 text-muted-foreground">Dein Team dagegen</h4>
      <p className="mb-3 text-xs text-muted-foreground">Gleichtypige Attacken: was dein Pokémon austeilt und was es einsteckt.</p>
      <ul className="grid gap-1">
        {rows.map(({ e, own, attack, defense }) => (
          <li key={e.encounter_id}>
            <button
              type="button"
              onClick={() => onPick(e.species_id)}
              className="grid w-full grid-cols-[2rem_minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg px-1.5 py-1 text-left text-sm hover:bg-secondary/60"
            >
              <Sprite id={e.species_id} name="" size="xs" idle={false} />
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium">{e.nickname ?? species.byId.get(e.species_id)?.name_de}</span>
                <span className="hidden gap-1 sm:flex">
                  {own.map((t) => (
                    <TypeChip key={t} type={t} small />
                  ))}
                </span>
              </span>
              <span className={cn('label rounded px-1.5 py-0.5 text-[0.6rem]', factorClass(attack))} title="Austeilen">
                trifft {factorLabel(attack)}
              </span>
              <span className={cn('label rounded px-1.5 py-0.5 text-[0.6rem]', factorClass(1 / Math.max(defense, 0.125)))} title="Einstecken">
                nimmt {factorLabel(defense)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Ganze Entwicklungsreihe mit Bedingungen, ausgehend von der ersten Stufe */
export function EvolutionChain({
  speciesId,
  dex,
  species,
  onPick,
}: {
  speciesId: number
  dex: DexData
  species: SpeciesIndex
  onPick?: (id: number) => void
}) {
  const base = useMemo(() => {
    let id = speciesId
    for (let i = 0; i < 5; i++) {
      const parent = Object.entries(dex.evos).find(([, list]) => list.some(([to]) => to === id))
      if (!parent) break
      id = Number(parent[0])
    }
    return id
  }, [speciesId, dex])

  const node = (id: number, how: string | null, depth: number): React.ReactNode => {
    const children = dex.evos[id] ?? []
    const name = species.byId.get(id)?.name_de ?? `#${id}`
    return (
      <div key={`${id}-${depth}`} className="flex flex-wrap items-center gap-2">
        {how && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowRight className="size-3.5 shrink-0" />
            <span className="max-w-[12rem]">{how}</span>
          </span>
        )}
        <button
          type="button"
          onClick={() => onPick?.(id)}
          disabled={!onPick}
          className={cn('flex flex-col items-center rounded-lg px-2 py-1', id === speciesId ? 'bg-secondary' : onPick && 'hover:bg-secondary/60')}
        >
          <Sprite id={id} name={name} size="sm" idle={false} />
          <span className="text-xs font-medium">{name}</span>
        </button>
        {children.length > 0 && (
          <div className="grid gap-1">{children.map(([to, text]) => node(to, text, depth + 1))}</div>
        )}
      </div>
    )
  }

  if (!dex.evos[base] && base === speciesId) {
    return <p className="text-sm text-muted-foreground">Entwickelt sich nicht.</p>
  }
  return <div className="overflow-x-auto">{node(base, null, 0)}</div>
}
