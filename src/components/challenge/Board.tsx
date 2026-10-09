import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Sprite } from '@/components/Sprite'
import { AddEncounterDialog, type AddTarget } from '@/components/challenge/AddEncounterDialog'
import { EncounterDialog } from '@/components/challenge/EncounterDialog'
import { StateChip } from '@/components/challenge/StateChip'
import type { ChallengeData } from '@/hooks/useChallenge'
import { speciesName, type Lookups } from '@/lib/describe'
import { useT } from '@/lib/i18n'
import { normalize, speciesLabel, type SpeciesIndex } from '@/lib/species'
import type { Encounter, Member } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Ban, Check, CopyX, Eye, EyeOff, Plus, Search, X } from 'lucide-react'
import { appendEvent } from '@/lib/actions'
import { analyzeLinks, hasMissed, missedKeys } from '@/lib/links'
import { toast, toastError } from '@/lib/toast'

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
  match,
  missed,
}: {
  encounter: Encounter | undefined
  /** Spieler hat diese Route als verpasst eingetragen */
  missed?: boolean
  species: SpeciesIndex | null
  onOpen: (e: Encounter) => void
  /** Bei aktiver Suche: Treffer hervorheben, den Rest abblenden */
  match?: boolean
  /** Nur gesetzt, wenn hier nachgetragen werden darf (Spieler, laufender Run) */
  onAdd?: () => void
}) {
  const t = useT()
  if (!encounter && missed) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 py-3 text-destructive/70">
        <span className="flex size-16 items-center justify-center rounded-full border-2 border-dashed border-current/40">
          <Ban className="size-5" />
        </span>
        <span className="label text-[0.6rem]">{t('Verpasst')}</span>
      </div>
    )
  }
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
        <span className="label text-[0.6rem]">{t('Nachtragen')}</span>
      </button>
    )
  }
  if (!encounter) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 py-3 text-muted-foreground/50">
        <span className="size-16" />
        <span className="label text-[0.6rem]">{t('keine')}</span>
      </div>
    )
  }
  const name = encounter.nickname ?? speciesName(species, encounter.species_id)
  return (
    <button
      type="button"
      onClick={() => onOpen(encounter)}
      className={cn(
        'group relative z-10 flex flex-col items-center gap-1 rounded-lg py-3 transition-[background-color,opacity,box-shadow] hover:bg-secondary/60 focus-visible:bg-secondary/60',
        match === true && 'bg-highlight/15 ring-2 ring-highlight',
        match === false && 'opacity-35',
      )}
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
  const t = useT()
  const [selected, setSelected] = useState<Encounter | null>(null)
  const [adding, setAdding] = useState<AddTarget | null>(null)
  const [query, setQuery] = useState('')
  const [showFailed, setShowFailed] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
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

  // Suche nach Pokémon (aktuelle oder gefangene Art, deutsch, englisch, Nummer, Spitzname) oder Route
  const q = normalize(query)
  const number = /^\d+$/.test(query.trim()) ? Number(query.trim()) : null
  // Gesucht wird nach ganzen Entwicklungsreihen: "Taubsi" findet auch Tauboga und Tauboss
  const chains = useMemo(() => {
    if (!q || !species) return new Set<number>()
    return new Set(
      species.list
        .filter((s) => s.id === number || normalize(s.name_de).includes(q) || normalize(s.name_en).includes(q))
        .map((s) => s.evolution_chain_id),
    )
  }, [q, number, species])
  const chainOf = (id: number) => species?.byId.get(id)?.evolution_chain_id ?? -1
  const matches = (e: Encounter) =>
    chains.has(chainOf(e.species_id)) || chains.has(chainOf(e.caught_species_id)) || (!!e.nickname && normalize(e.nickname).includes(q))
  // Dupe-Check: Passt die Suche genau zu einer Reihe, zeigen wir, ob sie in diesem Run schon gefangen wurde
  const dupeLine = chains.size === 1 && species ? species.list.find((s) => chains.has(s.evolution_chain_id) && s.evolution_stage === 1) : undefined
  const dupeHits = dupeLine ? data.encounters.filter(matches) : []
  const routeMatches = (row: RouteRow) => normalize(lookups.routes.get(row.routeId)?.name ?? '').includes(q)
  const visible = q ? rows.filter((row) => routeMatches(row) || [...row.cells.values()].some(matches)) : rows
  const hits = q ? visible.reduce((n, row) => n + [...row.cells.values()].filter(matches).length, 0) : 0

  // "/" springt in die Suche
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (event.key !== '/' || target.closest('input, textarea, [contenteditable]')) return
      event.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Vollständigkeit: verfallene Soul-Links (jemand hat verpasst) werden ausgeblendet
  const linkInfo = useMemo(() => analyzeLinks(players, data.encounters, data.events), [players, data.encounters, data.events])
  const missed = useMemo(() => missedKeys(data.events), [data.events])
  const rowFailed = (row: RouteRow) => row.links.length > 0 && row.links.every((l) => linkInfo.get(l.linkId)?.failed)
  const rowOpen = (row: RouteRow) =>
    row.links.flatMap((l) => {
      const info = linkInfo.get(l.linkId)
      return info && !info.complete ? info.missing.filter((id) => !info.missed.includes(id)) : []
    })
  const failedCount = rows.filter(rowFailed).length
  const shown = showFailed ? visible : visible.filter((row) => !rowFailed(row))

  // Soul-Link verfallen lassen: Wer noch fehlt, hat die Route verpasst (zählt und hakt die Route ab)
  const expire = async (row: RouteRow) => {
    setConfirming(null)
    try {
      for (const memberId of rowOpen(row)) {
        await appendEvent(data.challenge.id, 'encounter_missed', { member_id: memberId, route_id: row.routeId, kind: row.kind })
      }
      toast(t('{route}: Soul-Link verfallen, Route ausgeblendet', { route: lookups.routes.get(row.routeId)?.name ?? t('Route') }))
    } catch (error) {
      toastError(error)
    }
  }

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
        <p className="text-lg">{t('Noch keine Begegnungen in Run {run}.', { run: data.shownRun })}</p>
        {data.canWrite && data.shownRun === data.stats.current_run && (
          <button onClick={onLog} className="text-primary underline-offset-4 hover:underline">
            {t('Erste Begegnung eintragen')}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <label className="relative flex w-full max-w-sm items-center">
          <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            placeholder={t('Pokémon oder Route suchen …')}
            aria-label={t('Pokémon oder Route suchen')}
            className="h-10 w-full rounded-full border bg-card/70 pr-9 pl-9 text-sm shadow-sm outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/40 [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} className="absolute right-3 text-muted-foreground hover:text-foreground" aria-label={t('Suche leeren')}>
              <X className="size-4" />
            </button>
          ) : (
            <kbd className="label pointer-events-none absolute right-3 rounded border px-1.5 text-[0.6rem] text-muted-foreground">/</kbd>
          )}
        </label>
        <AnimatePresence>
          {q && (
            <motion.span
              key="hits"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="label text-[0.65rem] text-muted-foreground"
            >
              {hits === 1 ? t('1 Pokémon') : t('{n} Pokémon', { n: hits })} ·{' '}
              {visible.length === 1 ? t('1 Route') : t('{n} Routen', { n: visible.length })}
            </motion.span>
          )}
        </AnimatePresence>
        {failedCount > 0 && (
          <button
            type="button"
            onClick={() => setShowFailed((v) => !v)}
            className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            {showFailed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {showFailed ? t('Verfallene Routen ausblenden') : t('Verfallene Routen zeigen ({n})', { n: failedCount })}
          </button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {dupeLine && data.challenge.dupes_clause && (
          <motion.div
            key={dupeLine.id}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              'mb-5 flex max-w-2xl items-start gap-3 rounded-xl px-4 py-3 text-sm',
              dupeHits.length ? 'bg-highlight/20' : 'bg-ok/10 text-ok',
            )}
            role="status"
          >
            {dupeHits.length ? <CopyX className="mt-0.5 size-4 shrink-0" /> : <Check className="mt-0.5 size-4 shrink-0" />}
            <span>
              {dupeHits.length ? (
                <>
                  <span className="font-medium">{t('Dupe: {name}-Reihe schon gefangen', { name: speciesLabel(dupeLine) })}</span> –{' '}
                  {dupeHits
                    .map(
                      (e) =>
                        `${e.nickname ?? speciesName(species, e.species_id)} (${lookups.routes.get(e.route_id)?.name ?? t('Route')}, ${lookups.members.get(e.member_id)?.display_name ?? '?'})`,
                    )
                    .join(', ')}
                </>
              ) : (
                <>
                  <span className="font-medium">{t('{name}-Reihe', { name: speciesLabel(dupeLine) })}</span>{' '}
                  {t('wurde in diesem Run noch nicht gefangen.')}
                </>
              )}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="min-w-fit">
        <div className="label grid gap-2 border-b pb-3 text-muted-foreground" style={{ gridTemplateColumns: columns }}>
          <span>{t('Route')}</span>
          {players.map((p: Member) => (
            <span key={p.id} className="flex items-center justify-center gap-2 text-foreground">
              <span className="size-2 rounded-full" style={{ background: p.color ?? 'var(--primary)' }} />
              {p.display_name}
            </span>
          ))}
        </div>
        <AnimatePresence initial={false}>
          {shown.map((row, i) => (
            <motion.div
              key={row.key}
              layout
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.45, delay: Math.min(i, 10) * 0.03, ease: [0.16, 1, 0.3, 1] }}
              className={cn('grid items-center gap-2 border-b', (row.dead || rowFailed(row)) && 'bg-destructive/[0.04]')}
              style={{ gridTemplateColumns: columns }}
            >
              <div className="py-3 pr-2">
                <div className={cn('font-medium', (row.dead || rowFailed(row)) && 'text-muted-foreground', rowFailed(row) && 'line-through')}>
                  {lookups.routes.get(row.routeId)?.name ?? t('Route')}
                </div>
                {row.kind === 'static' && <span className="label text-[0.6rem] text-primary">{t('Static')}</span>}
                {rowFailed(row) && <span className="label ml-2 text-[0.6rem] text-destructive">{t('verfallen')}</span>}
                {canAdd && !rowFailed(row) && rowOpen(row).length > 0 && (
                  <div className="mt-1.5">
                    {confirming === row.key ? (
                      <span className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-muted-foreground">{t('Fehlende als verpasst?')}</span>
                        <button type="button" onClick={() => void expire(row)} className="font-medium text-destructive hover:underline">
                          {t('Ja')}
                        </button>
                        <button type="button" onClick={() => setConfirming(null)} className="text-muted-foreground hover:underline">
                          {t('Nein')}
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirming(row.key)}
                        className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-destructive"
                        title={t('Nicht alle haben hier etwas gefangen: Soul-Link verfällt, die Route wird ausgeblendet')}
                      >
                        <Ban className="size-3.5" /> {t('Verfallen lassen')}
                      </button>
                    )}
                  </div>
                )}
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
                    onAdd={canAdd && !q ? () => setAdding(addTarget(row, p)) : undefined}
                    missed={!row.cells.has(p.id) && hasMissed(missed, p.id, row.routeId, row.kind)}
                    match={q && !routeMatches(row) ? (row.cells.has(p.id) ? matches(row.cells.get(p.id)!) : undefined) : undefined}
                  />
                ))}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {q && shown.length === 0 && (
          <p className="py-12 text-center text-muted-foreground">{t('Kein Pokémon und keine Route passt zu „{query}“.', { query: query.trim() })}</p>
        )}
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
