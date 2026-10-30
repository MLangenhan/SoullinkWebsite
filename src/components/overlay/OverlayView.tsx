import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Sprite } from '@/components/Sprite'
import { capIndex, capLabel, presetFor } from '@/data/levelCaps'
import { useT } from '@/lib/i18n'
import { countLinks } from '@/lib/links'
import { latestLink, shownPlayers, teams, type OverlayConfig, type OverlayData, type Widget } from '@/lib/overlay'
import { useRouteNames } from '@/lib/routeNames'
import { speciesLabel, type SpeciesIndex } from '@/lib/species'
import type { Encounter } from '@/lib/types'
import { cn } from '@/lib/utils'

/*
  Darstellung eines OBS-Overlays. Wird von der Browserquelle (/obs, Daten per overlay_state) und von der
  Vorschau im Baukasten (Daten der Challenge-Seite) gleich genutzt, damit die Vorschau genau das zeigt,
  was im Stream erscheint.
*/

type Data = Pick<OverlayData, 'challenge' | 'stats' | 'members' | 'routes' | 'encounters' | 'events'>

const THEMES = {
  dark: 'rounded-2xl border border-white/10 bg-[#0b0e14]/80 text-white shadow-[0_10px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur-sm',
  light: 'rounded-2xl border border-black/10 bg-white/90 text-[#10151f] shadow-[0_10px_40px_-12px_rgba(0,0,0,0.35)] backdrop-blur-sm',
  // Ohne Fläche: Schatten hält den Text auf jedem Spielhintergrund lesbar
  clear: 'text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.9),0_0_8px_rgba(0,0,0,0.6)]',
} as const

function Panel({ config, title, aside, children }: { config: OverlayConfig; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className={cn('px-4 py-3', THEMES[config.theme])}>
      {config.titles && (
        <header className="mb-2 flex items-baseline justify-between gap-4">
          <h2 className="text-[0.7rem] font-semibold tracking-[0.14em] uppercase" style={{ color: config.accent }}>
            {title}
          </h2>
          {aside && <span className="text-xs opacity-80">{aside}</span>}
        </header>
      )}
      {children}
    </section>
  )
}

function pokemonName(encounter: Encounter, species: SpeciesIndex | null, config: OverlayConfig) {
  if (config.nicknames && encounter.nickname) return encounter.nickname
  const entry = species?.byId.get(encounter.species_id)
  return entry ? speciesLabel(entry) : `#${encounter.species_id}`
}

function LinkWidget({ data, config, species }: { data: Data; config: OverlayConfig; species: SpeciesIndex | null }) {
  const t = useT()
  const routeNames = useRouteNames(data.challenge)
  const players = shownPlayers(data.members, config.seats)
  const link = latestLink(data.encounters, players)
  const route = link ? data.routes.find((r) => r.id === link.routeId) : undefined

  return (
    <Panel config={config} title={t('Letzter Soul-Link')} aside={route ? routeNames.display(route.name) : undefined}>
      {!link ? (
        <p className="text-sm opacity-80">{t('Noch kein Fang in diesem Run.')}</p>
      ) : (
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.ul
            key={link.linkId}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="flex flex-wrap items-end gap-x-5 gap-y-3"
          >
            {link.catches.map(({ member, encounter }) => (
              <li key={member.id} className="flex w-24 flex-col items-center text-center">
                {encounter ? (
                  <Sprite id={encounter.species_id} name={pokemonName(encounter, species, config)} size="lg" state={encounter.state} />
                ) : (
                  <span className="flex size-24 items-center justify-center text-2xl opacity-50">–</span>
                )}
                {config.pokemonNames && encounter && (
                  <span className={cn('w-full truncate text-sm font-semibold', encounter.state !== 'team' && encounter.state !== 'box' && 'line-through opacity-70')}>
                    {pokemonName(encounter, species, config)}
                  </span>
                )}
                {config.names && <span className="w-full truncate text-xs opacity-75">{member.display_name}</span>}
              </li>
            ))}
          </motion.ul>
        </AnimatePresence>
      )}
    </Panel>
  )
}

function TeamWidget({ data, config, species }: { data: Data; config: OverlayConfig; species: SpeciesIndex | null }) {
  const t = useT()
  const rows = teams(data, shownPlayers(data.members, config.seats))
  return (
    <Panel config={config} title={t('Team')}>
      <ul className="grid gap-2">
        {rows.map(({ member, team }) => {
          const slots = config.emptySlots ? team : team.filter((e) => e !== null)
          return (
            <li key={member.id} className="flex items-center gap-3">
              {config.names && <span className="w-24 shrink-0 truncate text-sm font-semibold">{member.display_name}</span>}
              <ol className="flex gap-1.5">
                {slots.map((encounter, i) => (
                  <li key={encounter?.encounter_id ?? `leer-${i}`} className="flex w-16 flex-col items-center">
                    {encounter ? (
                      <Sprite id={encounter.species_id} name={pokemonName(encounter, species, config)} size="md" state={encounter.state} />
                    ) : (
                      <span className="size-16 rounded-full border-2 border-dashed border-current opacity-20" aria-label={t('Freier Platz')} />
                    )}
                    {config.pokemonNames && (
                      <span className="w-full truncate text-center text-[0.7rem] leading-tight opacity-90">
                        {encounter ? pokemonName(encounter, species, config) : ' '}
                      </span>
                    )}
                  </li>
                ))}
                {slots.length === 0 && <li className="text-sm opacity-70">{t('Team leer')}</li>}
              </ol>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

function CapWidget({ data, config }: { data: Data; config: OverlayConfig }) {
  const t = useT()
  const preset = presetFor(data.challenge)
  const index = capIndex(data.challenge, data.stats.current_run)
  const cap = preset && index !== null ? preset.caps[index] : null
  return (
    <Panel config={config} title={t('Level-Cap')}>
      {cap ? (
        <div className="flex items-baseline gap-3">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={cap.level}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="font-display text-5xl leading-none font-extrabold tabular-nums"
              style={{ color: config.accent }}
            >
              {cap.level}
            </motion.span>
          </AnimatePresence>
          <span className="max-w-56 text-sm leading-snug opacity-90">{capLabel(cap)}</span>
        </div>
      ) : (
        <p className="text-sm opacity-80">{t('Kein Level-Cap')}</p>
      )}
    </Panel>
  )
}

function StatsWidget({ data, config }: { data: Data; config: OverlayConfig }) {
  const t = useT()
  const links = countLinks(data.encounters)
  const items = [
    { label: t('Run'), value: data.stats.current_run },
    { label: t('Lebende Links'), value: links.alive },
    { label: t('Verlorene Links'), value: links.lost },
  ]
  return (
    <Panel config={config} title={data.challenge.name}>
      <dl className="flex gap-6">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-xs opacity-75">{item.label}</dt>
            <dd className="font-display text-3xl leading-none font-extrabold tabular-nums" style={{ color: config.accent }}>
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  )
}

const RENDER: Record<Widget, (props: { data: Data; config: OverlayConfig; species: SpeciesIndex | null }) => ReactNode> = {
  link: (p) => <LinkWidget {...p} />,
  team: (p) => <TeamWidget {...p} />,
  cap: (p) => <CapWidget {...p} />,
  stats: (p) => <StatsWidget {...p} />,
}

export function OverlayView({ data, config, species }: { data: Data; config: OverlayConfig; species: SpeciesIndex | null }) {
  const row = config.direction === 'row'
  return (
    <div
      className="flex w-max max-w-full gap-3 font-sans"
      style={{
        flexDirection: config.direction,
        alignItems: row ? 'flex-start' : config.align === 'start' ? 'flex-start' : config.align === 'end' ? 'flex-end' : 'center',
        zoom: config.scale / 100,
      }}
    >
      {config.widgets.map((widget) => (
        <div key={widget}>{RENDER[widget]({ data, config, species })}</div>
      ))}
    </div>
  )
}
