import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Sprite } from '@/components/Sprite'
import { AddEncounterDialog, type AddTarget } from '@/components/challenge/AddEncounterDialog'
import { EncounterDialog } from '@/components/challenge/EncounterDialog'
import { StateChip } from '@/components/challenge/StateChip'
import type { ChallengeData } from '@/hooks/useChallenge'
import { speciesName, type Lookups } from '@/lib/describe'
import type { SpeciesIndex } from '@/lib/species'
import type { Encounter, Member } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Plus } from 'lucide-react'

/** Eine Zeile: eine Route (wild oder static); bei Paaren enthält sie mehrere Soul-Links */
interface RouteRow {
  key: string
  routeId: string
  kind: Encounter['kind']
  cells: Map<string, Encounter>
  links: { linkId: string; dead: boolean; columns: number[] }[]
  dead: boolean
}

/**
 * Soul-Link-Band zwischen den Pokémon einer Zeile. Lebt der Link, läuft ein Schimmer durch;
 * stirbt ein Partner, reißt das Band in der Mitte und färbt sich rot.
 */
function LinkBand({ dead, filled, columns, lane }: { dead: boolean; filled: number[]; columns: number; lane: number }) {
  const reduce = useReducedMotion()
  // Nur zwischen dem ersten und letzten belegten Platz; ein einzelnes Pokémon hat kein Band
  if (filled.length < 2) return null
  const first = Math.min(...filled)
  const last = Math.max(...filled)
  const left = `${((first + 0.5) / columns) * 100}%`
  const right = `${((columns - last - 0.5) / columns) * 100}%`
  return (
    <div className="pointer-events-none absolute h-0.5" style={{ left, right, top: `calc(38% + ${lane * 7}px)` }} aria-hidden>
      {dead ? (
        <div className="relative size-full">
          <motion.div
            className="absolute inset-y-0 left-0 w-1/2 origin-left bg-destructive/70"
            initial={reduce ? false : { rotate: 0, x: 0 }}
            animate={{ rotate: 2, x: -8 }}
            transition={{ type: 'spring', stiffness: 260, damping: 12 }}
          />
          <motion.div
            className="absolute inset-y-0 right-0 w-1/2 origin-right bg-destructive/70"
            initial={reduce ? false : { rotate: 0, x: 0 }}
            animate={{ rotate: -2, x: 8 }}
            transition={{ type: 'spring', stiffness: 260, damping: 12 }}
          />
        </div>
      ) : (
        <motion.div
          className="size-full bg-[linear-gradient(90deg,transparent,var(--primary),transparent)] bg-[length:40%_100%] bg-no-repeat"
          style={{ backgroundColor: 'color-mix(in oklab, var(--primary) 25%, transparent)' }}
          animate={reduce ? undefined : { backgroundPositionX: ['-40%', '140%'] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: 'linear' }}
        />
      )}
    </div>
  )
}

function Cell({
  encounter,
  species,
  onOpen,
  onAdd,
}: {
  encounter: Encounter | undefined
  species: SpeciesIndex | null
  onOpen: (e: Encounter) => void
  /** Nur gesetzt, wenn hier nachgetragen werden darf (Spieler, laufender Run) */
  onAdd?: () => void
}) {
  if (!encounter && onAdd) {
    return (
      <button
        type="button"
        onClick={onAdd}
        className="group relative z-10 flex flex-col items-center justify-center gap-1 rounded-lg py-3 text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-primary focus-visible:bg-secondary/60"
      >
        <span className="flex size-16 items-center justify-center rounded-full border-2 border-dashed border-current/40 transition-transform group-hover:scale-105">
          <Plus className="size-5" />
        </span>
        <span className="label text-[0.6rem]">Nachtragen</span>
      </button>
    )
  }
  if (!encounter) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 py-3 text-muted-foreground/50">
        <span className="size-16" />
        <span className="label text-[0.6rem]">keine</span>
      </div>
    )
  }
  const name = encounter.nickname ?? speciesName(species, encounter.species_id)
  return (
    <button
      type="button"
      onClick={() => onOpen(encounter)}
      className="group relative z-10 flex flex-col items-center gap-1 rounded-lg py-3 transition-colors hover:bg-secondary/60 focus-visible:bg-secondary/60"
    >
      <Sprite id={encounter.species_id} name={name} state={encounter.state} size="md" />
      <span className={cn('max-w-full truncate px-1 text-sm font-medium', encounter.state === 'dead' && 'line-through decoration-destructive/70')}>
        {name}
      </span>
      <StateChip state={encounter.state} />
    </button>
  )
}

export function Board({
  data,
  species,
  lookups,
  onLog,
}: {
  data: ChallengeData
  species: SpeciesIndex | null
  lookups: Lookups
  onLog: () => void
}) {
  const [selected, setSelected] = useState<Encounter | null>(null)
  const [adding, setAdding] = useState<AddTarget | null>(null)
  const canAdd = data.canWrite && data.shownRun === data.stats.current_run
  const group = (memberId: string) => lookups.members.get(memberId)?.link_group ?? -1

  // Zu welchem Soul-Link der Zeile gehört ein Spieler, der dort noch fehlt? Der Link seiner Gruppe.
  const addTarget = (row: RouteRow, member: Member): AddTarget | null => {
    const route = lookups.routes.get(row.routeId)
    if (!route) return null
    const link = row.links.find((l) =>
      [...row.cells.values()].some((e) => e.link_id === l.linkId && group(e.member_id) === (member.link_group ?? -1)),
    )
    return { member, route, kind: row.kind, linkId: link?.linkId ?? null }
  }
  const players = data.players

  const routes = lookups.routes
  const rows = useMemo(() => {
    // Pro Route und Art eine Zeile; hat ein Spieler dort mehrere Pokémon (mehrere Statics), folgen weitere Zeilen
    const groups = new Map<string, Map<string, Encounter[]>>()
    for (const e of data.encounters) {
      const key = `${e.route_id}|${e.kind}`
      const perPlayer = groups.get(key) ?? new Map<string, Encounter[]>()
      perPlayer.set(e.member_id, [...(perPlayer.get(e.member_id) ?? []), e])
      groups.set(key, perPlayer)
    }
    const result: RouteRow[] = []
    for (const [key, perPlayer] of groups) {
      const depth = Math.max(...[...perPlayer.values()].map((list) => list.length))
      for (let i = 0; i < depth; i++) {
        const cells = new Map<string, Encounter>()
        for (const [memberId, list] of perPlayer) if (list[i]) cells.set(memberId, list[i])
        const first = cells.values().next().value as Encounter
        const links = new Map<string, { linkId: string; dead: boolean; columns: number[] }>()
        players.forEach((p, column) => {
          const e = cells.get(p.id)
          if (!e) return
          const link = links.get(e.link_id) ?? { linkId: e.link_id, dead: false, columns: [] }
          link.columns.push(column)
          link.dead ||= e.state === 'dead' || e.state === 'linked_dead'
          links.set(e.link_id, link)
        })
        result.push({
          key: `${key}|${i}`,
          routeId: first.route_id,
          kind: first.kind,
          cells,
          links: [...links.values()],
          dead: [...cells.values()].every((e) => e.state === 'dead' || e.state === 'linked_dead'),
        })
      }
    }
    const order = (r: RouteRow) => routes.get(r.routeId)?.sort_order ?? 0
    return result.sort((a, b) => order(a) - order(b) || (a.kind === b.kind ? 0 : a.kind === 'wild' ? -1 : 1))
  }, [data.encounters, routes, players])

  const columns = `minmax(7rem, 11rem) repeat(${players.length}, minmax(6.5rem, 1fr))`
  const current = selected ? (lookups.encounters.get(selected.encounter_id) ?? selected) : null

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-16 text-center">
        <div className="flex gap-2 opacity-70">
          {[387, 390, 393].map((id) => (
            <Sprite key={id} id={id} name="" size="md" />
          ))}
        </div>
        <p className="text-lg">Noch keine Begegnungen in Run {data.shownRun}.</p>
        {data.canWrite && data.shownRun === data.stats.current_run && (
          <button onClick={onLog} className="text-primary underline-offset-4 hover:underline">
            Erste Begegnung eintragen
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2">
      <div className="min-w-fit">
        <div className="label grid gap-2 border-b pb-3 text-muted-foreground" style={{ gridTemplateColumns: columns }}>
          <span>Route</span>
          {players.map((p: Member) => (
            <span key={p.id} className="flex items-center justify-center gap-2 text-foreground">
              <span className="size-2 rounded-full" style={{ background: p.color ?? 'var(--primary)' }} />
              {p.display_name}
            </span>
          ))}
        </div>
        <AnimatePresence initial={false}>
          {rows.map((row, i) => (
            <motion.div
              key={row.key}
              layout
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.45, delay: Math.min(i, 10) * 0.03, ease: [0.16, 1, 0.3, 1] }}
              className={cn('grid items-center gap-2 border-b', row.dead && 'bg-destructive/[0.04]')}
              style={{ gridTemplateColumns: columns }}
            >
              <div className="py-3 pr-2">
                <div className={cn('font-medium', row.dead && 'text-muted-foreground')}>
                  {lookups.routes.get(row.routeId)?.name ?? 'Route'}
                </div>
                {row.kind === 'static' && <span className="label text-[0.6rem] text-primary">Static</span>}
              </div>
              <div className="relative col-span-full col-start-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${players.length}, minmax(6.5rem, 1fr))` }}>
                {row.links.map((link, lane) => (
                  <LinkBand key={link.linkId} dead={link.dead} columns={players.length} filled={link.columns} lane={lane} />
                ))}
                {players.map((p) => (
                  <Cell
                    key={p.id}
                    encounter={row.cells.get(p.id)}
                    species={species}
                    onOpen={setSelected}
                    onAdd={canAdd ? () => setAdding(addTarget(row, p)) : undefined}
                  />
                ))}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <AddEncounterDialog target={adding} onOpenChange={(open) => !open && setAdding(null)} data={data} species={species} />
      <EncounterDialog
        encounter={current}
        data={data}
        species={species}
        lookups={lookups}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  )
}
