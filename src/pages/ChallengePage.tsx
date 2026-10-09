import { lazy, Suspense, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft, ChevronRight, Eye, Flag, Lock, Plus, Radio } from 'lucide-react'
import { Board } from '@/components/challenge/Board'
import { DexPanel } from '@/components/challenge/DexPanel'
import { EndRunDialog } from '@/components/challenge/EndRunDialog'
import { Graveyard } from '@/components/challenge/Graveyard'
import { LevelCapControl } from '@/components/challenge/LevelCapControl'
import { LogEncounterDialog } from '@/components/challenge/LogEncounterDialog'
import { SettingsPanel } from '@/components/challenge/SettingsPanel'
import { StatsPanel } from '@/components/challenge/StatsPanel'
import { TeamsPanel } from '@/components/challenge/TeamsPanel'
import { Timeline } from '@/components/challenge/Timeline'
import { Counter } from '@/components/fx/Counter'
import { Magnetic } from '@/components/fx/Magnetic'
import { SplitReveal } from '@/components/fx/SplitReveal'
import { Pokeball } from '@/components/Pokeball'
import { Button } from '@/components/ui/button'
import { useChallenge, useLookups } from '@/hooks/useChallenge'
import { useTeamNotices } from '@/hooks/useTeamNotices'
import { useSessionUserId } from '@/hooks/useSession'
import { useSpecies } from '@/hooks/useSpecies'
import { linkProps } from '@/lib/router'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

// Der Schadensrechner (mit den Daten aller Generationen) wird erst im Calc-Tab geladen
const CalcPanel = lazy(() => import('@/components/challenge/CalcPanel'))

const TABS = [
  { id: 'routen', label: 'Routen' },
  { id: 'teams', label: 'Teams' },
  { id: 'pokedex', label: 'Pokédex' },
  { id: 'calc', label: 'Calc' },
  { id: 'friedhof', label: 'Friedhof' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'zaehler', label: 'Zähler' },
  { id: 'einstellungen', label: 'Einstellungen' },
] as const
type TabId = (typeof TABS)[number]['id']

function readTab(): TabId {
  const tab = new URLSearchParams(window.location.search).get('tab')
  return TABS.some((entry) => entry.id === tab) ? (tab as TabId) : 'routen'
}

export function ChallengePage({ slug }: { slug: string }) {
  const t = useT()
  const userId = useSessionUserId()
  const species = useSpecies()
  const [run, setRun] = useState<number | null>(null)
  const [tab, setTab] = useState<TabId>(readTab)
  const [logOpen, setLogOpen] = useState(false)
  const [endOpen, setEndOpen] = useState(false)
  const state = useChallenge(slug, run, userId)
  const data = state.status === 'ready' ? state.data : null
  const lookups = useLookups(data)
  useTeamNotices(data, lookups, species, state.status === 'ready' ? state.refresh : undefined)

  useEffect(() => {
    const url = new URL(window.location.href)
    if (tab === 'routen') url.searchParams.delete('tab')
    else url.searchParams.set('tab', tab)
    window.history.replaceState(null, '', url)
  }, [tab])

  useEffect(() => {
    if (data) document.title = `${data.challenge.name} · Soul Link`
    return () => {
      document.title = 'Soul Link'
    }
  }, [data])

  if (state.status === 'loading' || userId === undefined) {
    return <Pokeball className="min-h-svh justify-center" />
  }
  if (state.status === 'missing' || state.status === 'error') {
    return (
      <main className="mx-auto flex min-h-svh max-w-xl flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="label text-primary">{state.status === 'error' ? t('Fehler') : t('Nicht gefunden')}</p>
        <h1 className="font-display tracking-tight text-5xl font-extrabold">
          {state.status === 'error' ? t('Da lief etwas schief') : t('Keine Challenge unter dieser Adresse')}
        </h1>
        <p className="text-muted-foreground">
          {state.status === 'error'
            ? state.message
            : t('Entweder gibt es sie nicht, oder sie ist privat und dieses Gerät ist noch nicht verbunden. Öffne deinen Einladungslink.')}
        </p>
        <a {...linkProps('/')} className="text-primary underline-offset-4 hover:underline">
          {t('Zur Startseite')}
        </a>
      </main>
    )
  }

  const d = state.data
  const isCurrent = d.shownRun === d.stats.current_run
  const alive = d.encounters.filter((e) => e.state === 'team' || e.state === 'box').length
  const lost = d.encounters.length - alive
  const tabs = TABS.filter((entry) => entry.id !== 'einstellungen' || d.me)

  return (
    <main className="mx-auto max-w-7xl px-4 pt-28 pb-24 md:px-8">
      <header className="grid gap-8 border-b pb-8">
        <div className="flex flex-wrap items-center gap-3">
          <span className="label flex items-center gap-1.5 text-muted-foreground">
            {d.challenge.visibility === 'public' ? <Radio className="size-3.5" /> : <Lock className="size-3.5" />}
            {d.challenge.visibility === 'public' ? t('Öffentlich') : t('Privat')}
          </span>
          {!d.canWrite && (
            <span className="label flex items-center gap-1.5 rounded border border-box/40 px-2 py-0.5 text-box">
              <Eye className="size-3.5" /> {t('Zuschauermodus')}
            </span>
          )}
        </div>
        <h1 className="font-display tracking-tight text-6xl leading-[0.85] font-extrabold md:text-8xl">
          <SplitReveal text={d.challenge.name} />
        </h1>

        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
            <div>
              <p className="label text-muted-foreground">{t('Run')}</p>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" disabled={d.shownRun <= 1} onClick={() => setRun(d.shownRun - 1)} aria-label={t('Vorheriger Run')}>
                  <ChevronLeft />
                </Button>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={d.shownRun}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -20, opacity: 0 }}
                    className="min-w-[2ch] text-center font-display tracking-tight text-6xl font-extrabold tabular-nums"
                  >
                    {d.shownRun}
                  </motion.span>
                </AnimatePresence>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={isCurrent}
                  onClick={() => setRun(d.shownRun + 1 >= d.stats.current_run ? null : d.shownRun + 1)}
                  aria-label={t('Nächster Run')}
                >
                  <ChevronRight />
                </Button>
              </div>
              <p className={cn('label text-[0.6rem]', isCurrent ? 'text-ok' : 'text-muted-foreground')}>
                {isCurrent ? t('läuft') : t('beendet')}
              </p>
            </div>
            <div>
              <p className="label text-muted-foreground">{t('Leben')}</p>
              <Counter to={alive} className="font-display tracking-tight text-6xl font-extrabold text-ok" />
            </div>
            <div>
              <p className="label text-muted-foreground">{t('Verloren')}</p>
              <Counter to={lost} className="font-display tracking-tight text-6xl font-extrabold text-destructive" />
            </div>
            {isCurrent && <LevelCapControl data={d} />}
          </div>

          {d.canWrite && isCurrent && (
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" size="lg" onClick={() => setEndOpen(true)}>
                <Flag /> {t('Run beenden')}
              </Button>
              <Magnetic>
                <Button size="lg" onClick={() => setLogOpen(true)}>
                  <Plus /> {t('Begegnung eintragen')}
                </Button>
              </Magnetic>
            </div>
          )}
        </div>
      </header>

      <nav className="sticky top-0 z-30 -mx-4 mb-8 overflow-x-auto border-b bg-background/85 px-4 backdrop-blur-md md:-mx-8 md:px-8" aria-label={t('Bereiche')}>
        <ul className="flex gap-1">
          {tabs.map((entry) => (
            <li key={entry.id}>
              <button
                onClick={() => setTab(entry.id)}
                className={cn(
                  'relative px-4 py-4 text-sm font-medium whitespace-nowrap transition-colors',
                  tab === entry.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
                aria-current={tab === entry.id ? 'page' : undefined}
              >
                {t(entry.label)}
                {tab === entry.id && <motion.span layoutId="tab-underline" className="absolute inset-x-2 -bottom-px h-0.5 bg-primary" />}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <AnimatePresence mode="wait">
        <motion.section
          key={`${tab}-${d.shownRun}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          {tab === 'routen' && <Board data={d} species={species} lookups={lookups} onLog={() => setLogOpen(true)} />}
          {tab === 'teams' && <TeamsPanel data={d} species={species} lookups={lookups} onChanged={state.refresh} />}
          {tab === 'pokedex' && <DexPanel data={d} species={species} />}
          {tab === 'calc' && (
            <Suspense fallback={<Pokeball className="py-16" />}>
              <CalcPanel data={d} species={species} />
            </Suspense>
          )}
          {tab === 'friedhof' && <Graveyard data={d} species={species} lookups={lookups} />}
          {tab === 'timeline' && <Timeline data={d} species={species} lookups={lookups} />}
          {tab === 'zaehler' && <StatsPanel data={d} />}
          {tab === 'einstellungen' && d.me && <SettingsPanel data={d} onChanged={state.refresh} />}
        </motion.section>
      </AnimatePresence>

      {d.canWrite && (
        <>
          <LogEncounterDialog open={logOpen} onOpenChange={setLogOpen} data={d} species={species} />
          <EndRunDialog open={endOpen} onOpenChange={setEndOpen} data={d} />
        </>
      )}
    </main>
  )
}
