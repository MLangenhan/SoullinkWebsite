import { useState } from 'react'
import { motion } from 'motion/react'
import { ExternalLink, PencilLine, Skull } from 'lucide-react'
import { EvolutionChain, TypeChip } from '@/components/challenge/DexPanel'
import { versionGroupFor } from '@/data/levelCaps'
import { pokewikiUrl, useDex } from '@/lib/dex'
import { SpeciesPicker } from '@/components/SpeciesPicker'
import { StateChip } from '@/components/challenge/StateChip'
import { Sprite } from '@/components/Sprite'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/input'
import type { ChallengeData } from '@/hooks/useChallenge'
import { appendEvent } from '@/lib/actions'
import { formatTime, speciesName, type Lookups } from '@/lib/describe'
import { useT } from '@/lib/i18n'
import { speciesLabel, type SpeciesIndex } from '@/lib/species'
import { toast, toastError } from '@/lib/toast'
import type { Encounter } from '@/lib/types'
import { cn } from '@/lib/utils'

/** Aktionen für ein einzelnes Pokémon: Team/Box, Entwicklung, Tod. */
export function EncounterDialog({
  encounter,
  data,
  species,
  lookups,
  onOpenChange,
}: {
  encounter: Encounter | null
  data: ChallengeData
  species: SpeciesIndex | null
  lookups: Lookups
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={encounter !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        {encounter && (
          <EncounterBody
            key={encounter.encounter_id}
            encounter={encounter}
            data={data}
            species={species}
            lookups={lookups}
            close={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EncounterBody({
  encounter,
  data,
  species,
  lookups,
  close,
}: {
  encounter: Encounter
  data: ChallengeData
  species: SpeciesIndex | null
  lookups: Lookups
  close: () => void
}) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [deathOpen, setDeathOpen] = useState(false)
  const [correcting, setCorrecting] = useState(false)
  const [cause, setCause] = useState('')
  const [opponent, setOpponent] = useState('')
  const [level, setLevel] = useState('')
  const [deathRoute, setDeathRoute] = useState(encounter.route_id)
  const dex = useDex(versionGroupFor(data.challenge))

  const alive = encounter.state === 'team' || encounter.state === 'box'
  const editable = data.canWrite && alive && encounter.run_number === data.stats.current_run
  // Falsches Pokémon eingetragen? Korrigieren geht auch bei toten Pokémon, aber nur im laufenden Run
  const correctable = data.canWrite && encounter.run_number === data.stats.current_run
  const name = speciesName(species, encounter.species_id)
  const owner = lookups.members.get(encounter.member_id)?.display_name ?? t('Unbekannt')
  const route = lookups.routes.get(encounter.route_id)?.name ?? t('Route')
  const chain = species?.chain(encounter.species_id).filter((s) => s.id !== encounter.species_id) ?? []
  const partners = data.encounters.filter((e) => e.link_id === encounter.link_id && e.encounter_id !== encounter.encounter_id)

  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true)
    try {
      await action()
      toast(message)
      close()
    } catch (error) {
      toastError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-4">
          <Sprite id={encounter.species_id} name={name} state={encounter.state} size="xl" />
          <div className="min-w-0">
            <DialogTitle className="font-display tracking-tight text-4xl font-extrabold">{encounter.nickname ?? name}</DialogTitle>
            <DialogDescription className="mt-1">
              {owner} · {route}
              {encounter.kind === 'static' && ` · ${t('Static')}`}
              {encounter.nickname && ` · ${name}`}
            </DialogDescription>
            <div className="mt-2">
              <StateChip state={encounter.state} />
            </div>
          </div>
        </div>
      </DialogHeader>

      {dex && species && dex.types[encounter.species_id] && (
        <div className="grid gap-3 rounded-lg border bg-card/60 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {dex.types[encounter.species_id].map((type) => (
              <TypeChip key={type} type={type} small />
            ))}
            <a
              href={pokewikiUrl(species.byId.get(encounter.species_id)?.name_de ?? name)}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              PokéWiki <ExternalLink className="size-3" />
            </a>
          </div>
          <EvolutionChain speciesId={encounter.species_id} dex={dex} species={species} />
        </div>
      )}

      {partners.length > 0 && (
        <div className="rounded-lg border bg-card/60 p-3">
          <p className="label mb-2 text-muted-foreground">{t('Soul-Link mit')}</p>
          <div className="flex flex-wrap gap-4">
            {partners.map((p) => (
              <div key={p.encounter_id} className="flex items-center gap-2 text-sm">
                <Sprite id={p.species_id} name={speciesName(species, p.species_id)} state={p.state} size="sm" />
                <span>
                  {lookups.members.get(p.member_id)?.display_name}
                  <br />
                  <span className="text-muted-foreground">{speciesName(species, p.species_id)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {encounter.state === 'dead' && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium text-destructive">
            <Skull className="size-4" />{' '}
            {encounter.lost_at ? t('Gestorben am {date}', { date: formatTime(encounter.lost_at) }) : t('Gestorben')}
          </p>
          <p className="mt-1 text-muted-foreground">
            {[
              encounter.death_cause,
              encounter.death_opponent && t('gegen {opponent}', { opponent: encounter.death_opponent }),
              encounter.death_level && t('Lv. {level}', { level: encounter.death_level }),
              encounter.death_route_id && t('auf {route}', { route: lookups.routes.get(encounter.death_route_id)?.name ?? '–' }),
            ]
              .filter(Boolean)
              .join(' · ') || t('Keine Details eingetragen.')}
          </p>
          {data.canWrite && <p className="mt-2 text-xs text-muted-foreground">{t('Versehen? In der Timeline rückgängig machen.')}</p>}
        </div>
      )}
      {encounter.state === 'linked_dead' && (
        <p className="rounded-lg border border-destructive/30 p-3 text-sm text-muted-foreground">
          {encounter.lost_with_encounter_id
            ? t('Durch den Soul-Link mitgestorben (mit {species}).', {
                species: speciesName(species, lookups.encounters.get(encounter.lost_with_encounter_id)?.species_id),
              })
            : t('Durch den Soul-Link mitgestorben.')}
        </p>
      )}

      {editable && (
        <div className="grid gap-5">
          <div className="grid gap-2">
            <p className="label text-muted-foreground">{t('Status')}</p>
            <div className="grid grid-cols-2 gap-2">
              {(['team', 'box'] as const).map((status) => (
                <Button
                  key={status}
                  variant={encounter.state === status ? 'default' : 'outline'}
                  disabled={busy || encounter.state === status}
                  onClick={() =>
                    run(
                      () => appendEvent(data.challenge.id, 'encounter_status_changed', { encounter_id: encounter.encounter_id, status }),
                      status === 'team' ? t('{name} ist jetzt im Team', { name }) : t('{name} ist jetzt in der Box', { name }),
                    )
                  }
                >
                  {status === 'team' ? t('Ins Team') : t('In die Box')}
                </Button>
              ))}
            </div>
          </div>

          {chain.length > 0 && (
            <div className="grid gap-2">
              <p className="label text-muted-foreground">{t('Entwicklung')}</p>
              <div className="flex flex-wrap gap-2">
                {chain.map((s) => (
                  <motion.button
                    key={s.id}
                    type="button"
                    disabled={busy}
                    whileHover={{ y: -3 }}
                    onClick={() =>
                      run(
                        () => appendEvent(data.challenge.id, 'encounter_evolved', { encounter_id: encounter.encounter_id, species_id: s.id }),
                        t('{name} hat sich zu {species} entwickelt!', { name, species: speciesLabel(s) }),
                      )
                    }
                    className="flex flex-col items-center rounded-lg border bg-card px-3 py-2 text-sm hover:border-primary/60"
                  >
                    <Sprite id={s.id} name={speciesLabel(s)} size="sm" />
                    {speciesLabel(s)}
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          {!deathOpen ? (
            <Button variant="outline" className="border-destructive/50 text-destructive hover:bg-destructive/10" onClick={() => setDeathOpen(true)}>
              <Skull /> {t('Tod eintragen')}
            </Button>
          ) : (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="grid gap-3 overflow-hidden rounded-lg border border-destructive/40 p-4"
              onSubmit={(e) => {
                e.preventDefault()
                void run(
                  () =>
                    appendEvent(data.challenge.id, 'pokemon_died', {
                      encounter_id: encounter.encounter_id,
                      route_id: deathRoute || null,
                      cause: cause || null,
                      opponent: opponent || null,
                      level: level ? Number(level) : null,
                    }),
                  t('{name} ist gestorben. Ruhe in Frieden.', { name }),
                )
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('Ursache')}>
                  <Input value={cause} onChange={(e) => setCause(e.target.value)} placeholder={t('Volltreffer')} maxLength={200} />
                </Field>
                <Field label={t('Gegner')}>
                  <Input value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder={t('Arenaleiterin Silvana')} maxLength={80} />
                </Field>
                <Field label={t('Level')}>
                  <Input type="number" min={1} max={100} value={level} onChange={(e) => setLevel(e.target.value)} />
                </Field>
                <Field label={t('Todesort')}>
                  <Select value={deathRoute} onChange={(e) => setDeathRoute(e.target.value)}>
                    <option value="">{t('Unbekannt')}</option>
                    {data.routes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {lookups.routes.get(r.id)?.name ?? r.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              {partners.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {t(partners.length === 1 ? 'Soul-Link: {names} stirbt mit.' : 'Soul-Link: {names} sterben mit.', {
                    names: partners.map((p) => speciesName(species, p.species_id)).join(', '),
                  })}
                </p>
              )}
              <Button type="submit" variant="destructive" disabled={busy} className={cn(busy && 'opacity-60')}>
                {t('Tod bestätigen')}
              </Button>
            </motion.form>
          )}
        </div>
      )}
      {correctable && species && (
        <div className="grid gap-2 border-t pt-4">
          {!correcting ? (
            <Button variant="ghost" className="w-fit text-muted-foreground" onClick={() => setCorrecting(true)}>
              <PencilLine /> {t('Falsches Pokémon? Ändern')}
            </Button>
          ) : (
            <>
              <p className="label text-muted-foreground">{t('Richtiges Pokémon')}</p>
              <SpeciesPicker
                index={species}
                value={null}
                autoFocus
                onChange={(id) => {
                  if (id === null) return
                  void run(
                    () => appendEvent(data.challenge.id, 'encounter_corrected', { encounter_id: encounter.encounter_id, species_id: id }),
                    t('Geändert zu {species} (rückgängig über die Timeline)', { species: speciesName(species, id) }),
                  )
                }}
              />
            </>
          )}
        </div>
      )}
    </>
  )
}
