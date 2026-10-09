import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Info, MapPinned, Plus, Search, X } from 'lucide-react'
import { Counter } from '@/components/fx/Counter'
import { Pokeball } from '@/components/Pokeball'
import { Button } from '@/components/ui/button'
import { versionGroupFor } from '@/data/levelCaps'
import type { ChallengeData } from '@/hooks/useChallenge'
import { areaOverview, useAreas, type AreaStatus, type PlayerAreaState } from '@/lib/areas'
import { getLang, useLang, useT } from '@/lib/i18n'
import type { EncounterKind } from '@/lib/types'
import { cn } from '@/lib/utils'

type Filter = 'open' | 'all'

/**
 * Alle Gebiete des Spiels mit Begegnungen und wer dort im gezeigten Run noch fehlt. Erledigt ist ein
 * Gebiet, wenn jeder Spieler ein Pokémon eingetragen oder die Begegnung verpasst hat.
 */
export function AreasPanel({ data, onLog }: { data: ChallengeData; onLog: (preset: { route: string; kind: EncounterKind }) => void }) {
  const t = useT()
  const lang = useLang()
  const versionGroup = versionGroupFor(data.challenge)
  const areas = useAreas(versionGroup)
  const [kind, setKind] = useState<EncounterKind>('wild')
  const [filter, setFilter] = useState<Filter>('open')
  const [query, setQuery] = useState('')
  const canLog = data.canWrite && data.shownRun === data.stats.current_run

  const overview = useMemo(
    () => (areas && areas !== 'error' ? areaOverview(areas, data.players, data.routes, data.encounters, data.events) : null),
    // lang: Namen hängen an der eingestellten Sprache
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [areas, data.players, data.routes, data.encounters, data.events, lang],
  )

  if (areas === 'error') {
    return (
      <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
        {t('Für dieses Spiel gibt es noch keine Gebietsliste.')}
      </p>
    )
  }
  if (!areas || !overview) return <Pokeball className="py-16" />

  const ofKind = overview.areas.filter((a) => a.kind === kind)
  const done = ofKind.filter((a) => a.done).length
  const openCount = (k: EncounterKind) => overview.areas.filter((a) => a.kind === k && !a.done).length
  const q = query.trim().toLowerCase()
  const shown = ofKind.filter(
    (a) => (filter === 'all' || !a.done) && (!q || a.name.toLowerCase().includes(q) || a.altName.toLowerCase().includes(q)),
  )
  const regions = areas.regions.map(([de, en], index) => ({
    name: getLang() === 'en' ? en : de,
    items: shown.filter((a) => a.region === index),
  }))

  return (
    <div className="grid gap-8">
      <section className="grid gap-5 border-y py-6 md:grid-cols-[auto_1fr] md:items-end md:gap-10">
        <div>
          <p className="label text-muted-foreground">{kind === 'wild' ? t('Gebiete erledigt') : t('Statics & Geschenke erledigt')}</p>
          <p className="font-display tracking-tight text-6xl font-extrabold">
            <Counter to={done} />
            <span className="text-muted-foreground/40"> / {ofKind.length}</span>
          </p>
        </div>
        <div className="grid gap-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
            <motion.div
              className="h-full origin-left rounded-full bg-ok"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: ofKind.length ? done / ofKind.length : 0 }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              value={kind}
              onChange={setKind}
              options={[
                { value: 'wild', label: `${t('Wild')} · ${openCount('wild')}` },
                { value: 'static', label: `${t('Static')} · ${openCount('static')}` },
              ]}
              label={t('Art der Begegnung')}
            />
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'open', label: t('Offen') },
                { value: 'all', label: t('Alle') },
              ]}
              label={t('Filter')}
            />
            <label className="relative flex w-full items-center sm:ml-auto sm:max-w-64">
              <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
                placeholder={t('Gebiet suchen …')}
                aria-label={t('Gebiet suchen')}
                className="h-9 w-full rounded-full border bg-card/70 pr-9 pl-9 text-sm shadow-sm outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/40 [&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} className="absolute right-3 text-muted-foreground hover:text-foreground" aria-label={t('Suche leeren')}>
                  <X className="size-4" />
                </button>
              )}
            </label>
          </div>
        </div>
      </section>

      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-10 text-center">
          <MapPinned className="size-6 text-ok" />
          <p className="text-lg">{q ? t('Kein Gebiet passt zur Suche.') : t('Alles abgehakt: Hier ist kein Gebiet mehr offen.')}</p>
        </div>
      ) : (
        regions
          .filter((r) => r.items.length > 0)
          .map((region) => (
            <section key={region.name} className="grid gap-3">
              {areas.regions.length > 1 && (
                <h3 className="font-display tracking-tight text-3xl font-extrabold">
                  {region.name} <span className="label align-middle text-muted-foreground">{region.items.length}</span>
                </h3>
              )}
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence initial={false}>
                  {region.items.map((area) => (
                    <AreaRow key={`${area.kind}-${area.routeName}`} area={area} canLog={canLog} onLog={onLog} />
                  ))}
                </AnimatePresence>
              </ul>
            </section>
          ))
      )}

      <div className="grid gap-2 text-sm text-muted-foreground">
        {overview.unmatched.length > 0 && (
          <p className="flex gap-2">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>
              {t('Diese Routen passen zu keinem Gebiet des Spiels und zählen hier nicht mit:')}{' '}
              <span className="text-foreground">{overview.unmatched.map((r) => r.name).join(', ')}</span>
            </span>
          </p>
        )}
        <p className="flex gap-2">
          <Info className="mt-0.5 size-4 shrink-0" />
          {t('Gebiete laut PokeAPI für das Originalspiel. Ein Randomizer tauscht die Pokémon, nicht die Orte.')}
        </p>
      </div>
    </div>
  )
}

function AreaRow({ area, canLog, onLog }: { area: AreaStatus; canLog: boolean; onLog: (preset: { route: string; kind: EncounterKind }) => void }) {
  const t = useT()
  const missing = area.players.filter((p) => p.state === 'open').map((p) => p.member.display_name)
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'flex min-h-14 items-center gap-3 rounded-xl border px-4 py-2.5 transition-colors',
        area.done ? 'border-transparent bg-secondary/50' : 'bg-card',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className={cn('flex items-center gap-1.5 truncate font-medium', area.done && 'text-muted-foreground')}>
          {area.done && <Check className="size-4 shrink-0 text-ok" />}
          <span className="truncate">{area.name}</span>
        </p>
        {area.started && (
          <p className="truncate text-xs text-muted-foreground">
            {area.done ? t('erledigt') : t('fehlt noch: {names}', { names: missing.join(', ') })}
          </p>
        )}
      </div>
      <PlayerDots players={area.players} />
      {canLog && !area.done && (
        <Button
          variant="ghost"
          size="icon"
          className="-mr-2 shrink-0"
          onClick={() => onLog({ route: area.routeName, kind: area.kind })}
          aria-label={t('{area} eintragen', { area: area.name })}
          title={t('Eintragen')}
        >
          <Plus />
        </Button>
      )}
    </motion.li>
  )
}

const STATE_LABEL: Record<PlayerAreaState, string> = { caught: 'gefangen', missed: 'verpasst', open: 'offen' }

function PlayerDots({ players }: { players: AreaStatus['players'] }) {
  const t = useT()
  return (
    <span className="flex shrink-0 items-center gap-1">
      {players.map(({ member, state }) => {
        const color = member.color ?? 'var(--primary)'
        return (
          <span
            key={member.id}
            title={`${member.display_name}: ${t(STATE_LABEL[state])}`}
            aria-label={`${member.display_name}: ${t(STATE_LABEL[state])}`}
            className={cn('relative size-3 rounded-full border-2', state === 'open' && 'bg-transparent opacity-60')}
            style={{ borderColor: color, background: state === 'caught' ? color : undefined }}
          >
            {state === 'missed' && <span className="absolute inset-x-[-2px] top-1/2 h-0.5 -translate-y-1/2 -rotate-45 rounded" style={{ background: color }} />}
          </span>
        )
      })}
    </span>
  )
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded-full border bg-card/70 p-0.5 text-sm">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cn(
            'rounded-full px-3 py-1 font-medium transition-colors',
            value === option.value ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
