import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from '@dnd-kit/core'
import { getEventCoordinates } from '@dnd-kit/utilities'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { ArrowLeftRight, Hand, Info, MapPin } from 'lucide-react'
import { Sprite } from '@/components/Sprite'
import { EncounterDialog } from '@/components/challenge/EncounterDialog'
import { StateChip } from '@/components/challenge/StateChip'
import { Button } from '@/components/ui/button'
import type { ChallengeData } from '@/hooks/useChallenge'
import { appendEvent } from '@/lib/actions'
import { formatTime, speciesName, type Lookups } from '@/lib/describe'
import type { SpeciesIndex } from '@/lib/species'
import { arrange, TEAM_SIZE, type Arrangement } from '@/lib/team'
import { toastError } from '@/lib/toast'
import type { Encounter, Member } from '@/lib/types'
import { cn } from '@/lib/utils'

const BOX_CELLS = 30
const spring = { type: 'spring', stiffness: 380, damping: 30 } as const

type DragData = { encounter: Encounter; from: 'team' | 'box'; slot: number }
type DropData = { kind: 'slot'; index: number } | { kind: 'box' } | { kind: 'box-pokemon'; encounter: Encounter }
type Move = { encounter: Encounter; status: 'team' | 'box'; slot?: number }

/** Konkrete Ziele (Platz, Box-Pokémon) vor der Box-Fläche; sonst die überlappende Fläche */
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  const specific = hits.filter((h) => h.id !== 'box')
  if (specific.length) return specific
  return hits.length ? hits : rectIntersection(args)
}

/** Das angehobene Pokémon sitzt mittig unter dem Zeiger, egal wo es gegriffen wurde */
const centerOnPointer: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  const start = activatorEvent && getEventCoordinates(activatorEvent)
  if (!start || !draggingNodeRect) return transform
  return {
    ...transform,
    x: transform.x + start.x - draggingNodeRect.left - draggingNodeRect.width / 2,
    y: transform.y + start.y - draggingNodeRect.top - draggingNodeRect.height / 2,
  }
}

/**
 * Team und Box eines Spielers wie im Spiel: Team links groß, Box als PC-Box daneben.
 * Per Drag and Drop wechseln Pokémon zwischen Team und Box; landet ein Box-Pokémon auf einem
 * belegten Platz, tauschen beide. Die Herkunft der Teammitglieder ist immer sichtbar.
 */
export function TeamsPanel({
  data,
  species,
  lookups,
  onChanged,
}: {
  data: ChallengeData
  species: SpeciesIndex | null
  lookups: Lookups
  onChanged: () => Promise<void>
}) {
  const players = data.players
  const [memberId, setMemberId] = useState(() => (data.me && data.me.role !== 'viewer' ? data.me.id : players[0]?.id))
  const player = players.find((p) => p.id === memberId) ?? players[0]
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Encounter | null>(null)
  const [override, setOverride] = useState<{ memberId: string; arrangement: Arrangement } | null>(null)
  const [dragging, setDragging] = useState<DragData | null>(null)
  // Nach dem Ablegen: vorläufige Anordnung, bis die geschriebenen Ereignisse geladen sind
  const [pending, setPending] = useState<number[] | null>(null)
  const busy = override !== null
  const editable = data.canWrite && data.shownRun === data.stats.current_run

  const arrangements = useMemo(
    () => new Map(players.map((p) => [p.id, arrange(p.id, data.encounters, data.events)])),
    [players, data.encounters, data.events],
  )
  useEffect(() => {
    if (!pending) return
    const loaded = pending.every((id) => data.events.some((e) => e.id === id))
    const timer = setTimeout(() => {
      setOverride(null)
      setPending(null)
    }, loaded ? 0 : 6000)
    return () => clearTimeout(timer)
  }, [pending, data.events])

  const arrangement = (override?.memberId === player?.id ? override.arrangement : null) ?? arrangements.get(player?.id ?? '')

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  )

  if (!player || !arrangement) return null
  const name = (e: Encounter) => e.nickname ?? speciesName(species, e.species_id)
  const routeName = (e: Encounter) => lookups.routes.get(e.route_id)?.name ?? 'Route'
  const selected = selectedId ? (lookups.encounters.get(selectedId) ?? null) : null
  const teamCount = arrangement.slots.filter(Boolean).length

  const onDragStart = (event: DragStartEvent) => {
    setDragging(event.active.data.current as DragData)
    setSelectedId((event.active.data.current as DragData).encounter.encounter_id)
  }

  const onDragEnd = async (event: DragEndEvent) => {
    setDragging(null)
    const from = event.active.data.current as DragData | undefined
    const to = event.over?.data.current as DropData | undefined
    if (!from || !to || busy) return

    const slots = [...arrangement.slots]
    let box = [...arrangement.box]
    const moves: Move[] = []
    const id = from.encounter.encounter_id

    if (to.kind === 'slot' && from.from === 'box') {
      const occupant = slots[to.index]
      if (!occupant && teamCount >= TEAM_SIZE) return
      if (occupant) moves.push({ encounter: occupant, status: 'box' })
      moves.push({ encounter: from.encounter, status: 'team', slot: to.index + 1 })
      slots[to.index] = from.encounter
      box = box.filter((e) => e.encounter_id !== id)
      if (occupant) box.push(occupant)
    } else if (to.kind === 'slot' && from.from === 'team') {
      if (to.index === from.slot) return
      moves.push({ encounter: from.encounter, status: 'team', slot: to.index + 1 })
      slots[from.slot] = slots[to.index]
      slots[to.index] = from.encounter
    } else if (to.kind === 'box' && from.from === 'team') {
      moves.push({ encounter: from.encounter, status: 'box' })
      slots[from.slot] = null
      box.push(from.encounter)
    } else if (to.kind === 'box-pokemon' && from.from === 'team') {
      moves.push({ encounter: from.encounter, status: 'box' })
      moves.push({ encounter: to.encounter, status: 'team', slot: from.slot + 1 })
      slots[from.slot] = to.encounter
      box = box.filter((e) => e.encounter_id !== to.encounter.encounter_id)
      box.push(from.encounter)
    } else {
      return
    }

    box.sort((a, b) => a.logged_at.localeCompare(b.logged_at))
    setOverride({ memberId: player.id, arrangement: { slots, box } })
    const written: number[] = []
    try {
      // Erst in die Box, dann ins Team: So ist beim Tauschen immer ein Platz frei
      for (const move of moves) {
        const event = await appendEvent(data.challenge.id, 'encounter_status_changed', {
          encounter_id: move.encounter.encounter_id,
          status: move.status,
          ...(move.slot ? { slot: move.slot } : {}),
        })
        written.push(event.id)
      }
      setPending(written)
    } catch (error) {
      toastError(error)
      setOverride(null)
    }
    void onChanged().catch(() => undefined)
  }

  return (
    <LayoutGroup id={`teams-${player.id}`}>
      <PlayerTabs players={players} active={player.id} arrangements={arrangements} onSelect={(id) => {
        setMemberId(id)
        setSelectedId(null)
      }} />

      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        // Erst ganz am Rand scrollen, damit Ziele oben und unten erreichbar bleiben
        autoScroll={{ threshold: { x: 0, y: 0.1 } }}
        onDragStart={onDragStart}
        onDragEnd={(event) => void onDragEnd(event)}
        onDragCancel={() => setDragging(null)}
        accessibility={{
          screenReaderInstructions: {
            draggable: 'Leertaste zum Aufnehmen, Pfeiltasten zum Bewegen, Leertaste zum Ablegen, Escape zum Abbrechen.',
          },
        }}
      >
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <section className="soft-card rounded-2xl p-5 md:p-6" aria-label={`Team von ${player.display_name}`} aria-busy={busy}>
            <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display tracking-tight text-3xl font-extrabold">Team</h3>
              <span className="label text-ok">
                {teamCount} / {TEAM_SIZE}
              </span>
            </header>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {arrangement.slots.map((encounter, index) => (
                <TeamSlot
                  key={index}
                  index={index}
                  encounter={encounter}
                  name={encounter ? name(encounter) : ''}
                  route={encounter ? routeName(encounter) : ''}
                  editable={editable && !busy}
                  selected={!!encounter && encounter.encounter_id === selectedId}
                  dragging={dragging}
                  onSelect={setSelectedId}
                />
              ))}
            </div>
            <Origins
              slots={arrangement.slots}
              name={name}
              routeName={routeName}
              species={species}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </section>

          <div className="grid content-start gap-6">
            <PcBox
              box={arrangement.box}
              name={name}
              editable={editable && !busy}
              selectedId={selectedId}
              dragging={dragging}
              onSelect={setSelectedId}
            />
            <Details
              encounter={selected && selected.member_id === player.id ? selected : null}
              arrangement={arrangement}
              data={data}
              lookups={lookups}
              species={species}
              name={name}
              routeName={routeName}
              onMore={setDetail}
            />
          </div>
        </div>

        {/* Im body, damit animierte Vorfahren (transform) die Position nicht verschieben */}
        {createPortal(
          <DragOverlay dropAnimation={null} modifiers={[centerOnPointer]} zIndex={60}>
            {dragging && <Lifted encounter={dragging.encounter} name={name(dragging.encounter)} />}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>

      {editable && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Hand className="size-4" /> Pokémon ziehen: zwischen Team und Box wechseln, auf einen belegten Platz ziehen
          zum Tauschen. Am Handy kurz gedrückt halten.
        </p>
      )}

      <EncounterDialog
        encounter={detail ? (lookups.encounters.get(detail.encounter_id) ?? detail) : null}
        data={data}
        species={species}
        lookups={lookups}
        onOpenChange={(open) => !open && setDetail(null)}
      />
    </LayoutGroup>
  )
}

function PlayerTabs({
  players,
  active,
  arrangements,
  onSelect,
}: {
  players: Member[]
  active: string
  arrangements: Map<string, Arrangement>
  onSelect: (id: string) => void
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4" role="tablist" aria-label="Spieler">
      <div className="flex min-w-fit gap-2">
        {players.map((p) => {
          const team = arrangements.get(p.id)?.slots.filter((e): e is Encounter => e !== null) ?? []
          const isActive = p.id === active
          return (
            <button
              key={p.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(p.id)}
              className={cn(
                'relative flex items-center gap-3 rounded-xl border px-4 py-2.5 text-left transition-colors',
                isActive ? 'border-transparent text-foreground' : 'bg-card/40 text-muted-foreground hover:text-foreground',
              )}
            >
              {isActive && (
                <motion.span layoutId="team-tab" className="absolute inset-0 rounded-xl bg-card shadow-md ring-1 ring-border" transition={spring} />
              )}
              <span className="relative flex items-center gap-2 font-medium">
                <span className="size-2.5 rounded-full" style={{ background: p.color ?? 'var(--primary)' }} />
                {p.display_name}
              </span>
              <span className="relative flex -space-x-2">
                {team.map((e) => (
                  <Sprite key={e.encounter_id} id={e.species_id} name="" size="xs" idle={false} />
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TeamSlot({
  index,
  encounter,
  name,
  route,
  editable,
  selected,
  dragging,
  onSelect,
}: {
  index: number
  encounter: Encounter | null
  name: string
  route: string
  editable: boolean
  selected: boolean
  dragging: DragData | null
  onSelect: (id: string) => void
}) {
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: `slot:${index}`, data: { kind: 'slot', index } satisfies DropData, disabled: !editable })
  const { setNodeRef: dragRef, listeners, attributes } = useDraggable({
    id: encounter ? `team:${encounter.encounter_id}` : `team-empty:${index}`,
    data: encounter ? ({ encounter, from: 'team', slot: index } satisfies DragData) : undefined,
    disabled: !editable || !encounter,
  })
  const source = !!encounter && dragging?.encounter.encounter_id === encounter.encounter_id
  const swapping = isOver && !!encounter && !source && dragging !== null

  return (
    <motion.div
      ref={dropRef}
      animate={{ scale: isOver ? 1.04 : 1 }}
      transition={spring}
      className={cn(
        'relative aspect-[4/5] rounded-2xl border bg-[radial-gradient(circle_at_50%_38%,color-mix(in_oklab,var(--primary)_10%,transparent),transparent_62%)] transition-colors',
        encounter ? 'border-border bg-card' : 'border-dashed border-border/80 bg-background/40',
        isOver && 'border-primary ring-2 ring-primary/40',
        selected && !isOver && 'ring-2 ring-highlight',
      )}
    >
      <span className="label absolute top-2 left-2.5 text-[0.6rem] text-muted-foreground">{index + 1}</span>
      {encounter ? (
        <motion.button
          key={encounter.encounter_id}
          ref={dragRef}
          initial={{ opacity: 0, scale: 0.6, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 22 }}
          {...listeners}
          {...attributes}
          type="button"
          onClick={() => onSelect(encounter.encounter_id)}
          className={cn(
            'flex size-full flex-col items-center justify-center gap-1 rounded-2xl px-2 pt-4 pb-3 outline-none focus-visible:ring-2 focus-visible:ring-primary',
            editable && 'cursor-grab active:cursor-grabbing',
            source && 'opacity-30',
          )}
          aria-label={`${name} auf Platz ${index + 1}, von ${route}`}
        >
          <Sprite id={encounter.species_id} name={name} state={encounter.state} size="lg" />
          <span className="max-w-full truncate font-medium">{name}</span>
          <span className="flex max-w-full items-center gap-1 truncate text-xs text-muted-foreground">
            <MapPin className="size-3 shrink-0" />
            {route}
          </span>
        </motion.button>
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground/50">
          <span className="size-12 rounded-full border-2 border-dashed border-current" />
          <span className="label text-[0.6rem]">frei</span>
        </div>
      )}
      <AnimatePresence>
        {swapping && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="label absolute inset-x-0 bottom-2 mx-auto flex w-fit items-center gap-1 rounded-full bg-primary px-2 py-1 text-[0.6rem] text-primary-foreground"
          >
            <ArrowLeftRight className="size-3" /> Tauschen
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/** Immer sichtbar: woher die Teammitglieder kommen */
function Origins({
  slots,
  name,
  routeName,
  species,
  selectedId,
  onSelect,
}: {
  slots: (Encounter | null)[]
  name: (e: Encounter) => string
  routeName: (e: Encounter) => string
  species: SpeciesIndex | null
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="mt-6 border-t pt-4">
      <p className="label mb-2 text-muted-foreground">Herkunft</p>
      <ol className="grid gap-0.5">
        {slots.map((e, index) => (
          <li key={index}>
            {e ? (
              <motion.button
                layout="position"
                type="button"
                onClick={() => onSelect(e.encounter_id)}
                className={cn(
                  'grid w-full grid-cols-[1.25rem_2rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2 py-1 text-left text-sm transition-colors hover:bg-secondary/60',
                  e.encounter_id === selectedId && 'bg-secondary',
                )}
              >
                <span className="label text-[0.6rem] text-muted-foreground">{index + 1}</span>
                <Sprite id={e.species_id} name="" size="xs" idle={false} />
                <span className="truncate">
                  <span className="font-medium">{name(e)}</span>
                  {e.caught_species_id !== e.species_id && (
                    <span className="text-muted-foreground"> · gefangen als {speciesName(species, e.caught_species_id)}</span>
                  )}
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  {routeName(e)}
                  {e.kind === 'static' && <span className="label text-[0.55rem] text-primary">Static</span>}
                </span>
              </motion.button>
            ) : (
              <div className="grid grid-cols-[1.25rem_2rem_minmax(0,1fr)] items-center gap-2 px-2 py-1 text-sm text-muted-foreground/60">
                <span className="label text-[0.6rem]">{index + 1}</span>
                <span className="size-2 justify-self-center rounded-full border border-current" />
                <span>frei</span>
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

function PcBox({
  box,
  name,
  editable,
  selectedId,
  dragging,
  onSelect,
}: {
  box: Encounter[]
  name: (e: Encounter) => string
  editable: boolean
  selectedId: string | null
  dragging: DragData | null
  onSelect: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'box', data: { kind: 'box' } satisfies DropData, disabled: !editable })
  const cells = Math.max(BOX_CELLS, Math.ceil((box.length + 1) / 6) * 6)
  const fromTeam = dragging?.from === 'team'
  return (
    <section
      ref={setNodeRef}
      aria-label="Box"
      className={cn(
        'overflow-hidden rounded-2xl border-2 bg-box/[0.06] transition-colors',
        isOver && fromTeam ? 'border-box' : 'border-box/25',
      )}
    >
      <header className="flex items-center justify-between bg-box/90 px-4 py-2.5 text-white">
        <h3 className="font-display tracking-tight text-xl font-extrabold">Box</h3>
        <span className="label text-[0.65rem] text-white/85">{box.length} Pokémon</span>
      </header>
      <div
        className="grid grid-cols-6 gap-1.5 p-3"
        style={{ backgroundImage: 'radial-gradient(color-mix(in oklab, var(--box) 18%, transparent) 1px, transparent 1px)', backgroundSize: '12px 12px' }}
      >
        {Array.from({ length: cells }, (_, i) => box[i]).map((e, i) =>
          e ? (
            <BoxCell
              key={e.encounter_id}
              encounter={e}
              name={name(e)}
              editable={editable}
              selected={e.encounter_id === selectedId}
              dragging={dragging}
              onSelect={onSelect}
            />
          ) : (
            <span key={`empty-${i}`} className="aspect-square rounded-lg bg-background/40" />
          ),
        )}
      </div>
    </section>
  )
}

function BoxCell({
  encounter,
  name,
  editable,
  selected,
  dragging,
  onSelect,
}: {
  encounter: Encounter
  name: string
  editable: boolean
  selected: boolean
  dragging: DragData | null
  onSelect: (id: string) => void
}) {
  const { setNodeRef: dragRef, listeners, attributes } = useDraggable({
    id: `box:${encounter.encounter_id}`,
    data: { encounter, from: 'box', slot: -1 } satisfies DragData,
    disabled: !editable,
  })
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: `box-pokemon:${encounter.encounter_id}`,
    data: { kind: 'box-pokemon', encounter } satisfies DropData,
    disabled: !editable || dragging?.from !== 'team',
  })
  const source = dragging?.encounter.encounter_id === encounter.encounter_id
  return (
    <motion.button
      ref={(node: HTMLButtonElement | null) => {
        dragRef(node)
        dropRef(node)
      }}
      layout="position"
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 24 }}
      {...listeners}
      {...attributes}
      type="button"
      onClick={() => onSelect(encounter.encounter_id)}
      title={name}
      aria-label={`${name} in der Box`}
      className={cn(
        'relative flex aspect-square items-center justify-center rounded-lg bg-card/80 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-primary',
        editable && 'cursor-grab active:cursor-grabbing',
        selected && 'ring-2 ring-highlight',
        isOver && 'ring-2 ring-primary',
        source && 'opacity-30',
      )}
    >
      <Sprite id={encounter.species_id} name={name} state={encounter.state} size="sm" idle={false} />
      {isOver && (
        <span className="absolute -top-1.5 -right-1.5 rounded-full bg-primary p-1 text-primary-foreground">
          <ArrowLeftRight className="size-3" />
        </span>
      )}
    </motion.button>
  )
}

/** Das gezogene Pokémon: angehoben, leicht gekippt */
function Lifted({ encounter, name }: { encounter: Encounter; name: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={{ scale: 1, rotate: 0 }}
      animate={reduce ? { scale: 1.05 } : { scale: 1.15, rotate: -5 }}
      transition={spring}
      className="flex cursor-grabbing flex-col items-center rounded-2xl bg-card/95 px-3 py-2 shadow-2xl ring-1 ring-border"
    >
      <Sprite id={encounter.species_id} name={name} state={encounter.state} size="lg" idle={false} />
      <span className="text-sm font-medium">{name}</span>
    </motion.div>
  )
}

/** Herkunft und Soul-Link des ausgewählten Pokémon */
function Details({
  encounter,
  arrangement,
  data,
  lookups,
  species,
  name,
  routeName,
  onMore,
}: {
  encounter: Encounter | null
  arrangement: Arrangement
  data: ChallengeData
  lookups: Lookups
  species: SpeciesIndex | null
  name: (e: Encounter) => string
  routeName: (e: Encounter) => string
  onMore: (e: Encounter) => void
}) {
  if (!encounter) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-dashed px-5 py-6 text-sm text-muted-foreground">
        <Info className="size-4 shrink-0" /> Pokémon anklicken, um Herkunft und Soul-Link zu sehen.
      </div>
    )
  }
  const slot = arrangement.slots.findIndex((e) => e?.encounter_id === encounter.encounter_id)
  const partners = data.encounters.filter((e) => e.link_id === encounter.link_id && e.encounter_id !== encounter.encounter_id)
  return (
    <AnimatePresence mode="wait">
      <motion.section
        key={encounter.encounter_id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="soft-card rounded-2xl p-5"
        aria-label={`Details zu ${name(encounter)}`}
      >
        <div className="flex items-center gap-4">
          <Sprite id={encounter.species_id} name={name(encounter)} state={encounter.state} size="lg" />
          <div className="min-w-0">
            <p className="truncate font-display tracking-tight text-2xl font-extrabold">{name(encounter)}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StateChip state={encounter.state} />
              {slot >= 0 && <span className="label text-[0.6rem] text-muted-foreground">Platz {slot + 1}</span>}
            </div>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Herkunft</dt>
          <dd className="font-medium">
            {routeName(encounter)}
            {encounter.kind === 'static' && <span className="label ml-2 text-[0.6rem] text-primary">Static</span>}
          </dd>
          <dt className="text-muted-foreground">Gefangen als</dt>
          <dd>{speciesName(species, encounter.caught_species_id)}</dd>
          <dt className="text-muted-foreground">Eingetragen</dt>
          <dd>{formatTime(encounter.logged_at)}</dd>
        </dl>
        {partners.length > 0 && (
          <div className="mt-4 border-t pt-3">
            <p className="label mb-2 text-muted-foreground">Soul-Link</p>
            <ul className="grid gap-1">
              {partners.map((p) => {
                const owner = lookups.members.get(p.member_id)
                return (
                  <li key={p.encounter_id} className="flex items-center gap-2 text-sm">
                    <Sprite id={p.species_id} name="" size="xs" state={p.state} idle={false} />
                    <span className="size-2 rounded-full" style={{ background: owner?.color ?? 'var(--primary)' }} />
                    <span className="text-muted-foreground">{owner?.display_name}</span>
                    <span className="truncate font-medium">{name(p)}</span>
                    <span className="ml-auto">
                      <StateChip state={p.state} />
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
        <Button variant="outline" size="sm" className="mt-4" onClick={() => onMore(encounter)}>
          Entwicklung, Tod und mehr
        </Button>
      </motion.section>
    </AnimatePresence>
  )
}
