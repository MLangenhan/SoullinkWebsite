import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/input'
import { SpeciesPicker } from '@/components/SpeciesPicker'
import { Pokeball } from '@/components/Pokeball'
import { Sprite } from '@/components/Sprite'
import type { ChallengeData } from '@/hooks/useChallenge'
import { DupeWarning } from '@/components/challenge/DupeWarning'
import { appendEvent, changeTeam, createRoute } from '@/lib/actions'
import { autoStatus } from '@/lib/links'
import { speciesName } from '@/lib/describe'
import { useT } from '@/lib/i18n'
import type { SpeciesIndex } from '@/lib/species'
import { toast, toastError } from '@/lib/toast'
import type { EncounterKind } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Entry {
  speciesId: number | null
  missed: boolean
  /** Feste IDs pro geöffnetem Dialog: Erneutes Absenden nach einem Fehler erzeugt keine Duplikate */
  encounterId: string
  clientEventId: string
}

function freshEntries(data: ChallengeData): Record<string, Entry> {
  return Object.fromEntries(
    data.players.map((p) => [
      p.id,
      { speciesId: null, missed: false, encounterId: crypto.randomUUID(), clientEventId: crypto.randomUUID() },
    ]),
  )
}

/** Wie /add im Bot: eine Route, für jeden Spieler ein Pokémon (oder verpasst). Je Soul-Link-Gruppe ein Soul-Link. */
export function LogEncounterDialog({
  open,
  onOpenChange,
  data,
  species,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: ChallengeData
  species: SpeciesIndex | null
}) {
  const t = useT()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display tracking-tight text-4xl font-extrabold">{t('Begegnung eintragen')}</DialogTitle>
          <DialogDescription>
            {data.players.some((p) => p.link_group !== null)
              ? t('Die Pokémon jedes Soul-Link-Paars sind verbunden. Stirbt eins, stirbt der Partner mit.')
              : t('Alle Pokémon dieser Route bilden einen Soul-Link. Stirbt eins, sterben alle.')}
          </DialogDescription>
        </DialogHeader>
        {open && (species ? <LogForm data={data} species={species} close={() => onOpenChange(false)} /> : <Pokeball className="py-10" />)}
      </DialogContent>
    </Dialog>
  )
}

function LogForm({ data, species, close }: { data: ChallengeData; species: SpeciesIndex; close: () => void }) {
  const t = useT()
  const listId = useId()
  const [routeName, setRouteName] = useState('')
  const [kind, setKind] = useState<EncounterKind>('wild')
  const [entries, setEntries] = useState(() => freshEntries(data))
  const [busy, setBusy] = useState(false)

  // Gibt es die Route schon, zeigen wir, wer dort (wild) bereits eingetragen ist; nur die Fehlenden
  // werden ergänzt. Den passenden Soul-Link (alle oder Paar) wählt die Datenbank selbst.
  const existingRoute = data.routes.find((r) => r.name.trim().toLowerCase() === routeName.trim().toLowerCase())
  const existing = new Map(
    kind === 'wild' && existingRoute
      ? data.encounters
          .filter((e) => e.route_id === existingRoute.id && e.kind === 'wild')
          .map((e) => [e.member_id, e] as const)
      : [],
  )

  const update = (memberId: string, patch: Partial<Entry>) =>
    setEntries((all) => ({ ...all, [memberId]: { ...all[memberId], ...patch } }))

  const open = data.players.filter((p) => !existing.has(p.id))
  const filled = open.filter((p) => entries[p.id]?.speciesId !== null || entries[p.id]?.missed)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (filled.length === 0) return
    setBusy(true)
    try {
      // Team oder Box: Team nur, wenn der Soul-Link damit vollständig ist und alle Platz haben
      const caught = open.filter((p) => entries[p.id].speciesId !== null && !entries[p.id].missed).map((p) => p.id)
      const plan = autoStatus(data.players, data.encounters, existingRoute?.id ?? null, kind, caught)
      const route = await createRoute(data.challenge.id, routeName)
      for (const player of open) {
        const entry = entries[player.id]
        if (entry.missed) {
          await appendEvent(data.challenge.id, 'encounter_missed', { member_id: player.id, route_id: route.id, kind }, entry.clientEventId)
        } else if (entry.speciesId !== null) {
          await appendEvent(
            data.challenge.id,
            'encounter_logged',
            {
              encounter_id: entry.encounterId,
              member_id: player.id,
              route_id: route.id,
              species_id: entry.speciesId,
              kind,
              status: plan.status.get(player.id) ?? 'box',
            },
            entry.clientEventId,
          )
        }
      }
      if (plan.promote.length) {
        await changeTeam(
          data.challenge.id,
          crypto.randomUUID(),
          plan.promote.map((e) => ({ encounter_id: e.encounter_id, status: 'team' as const })),
        )
      }
      toast(
        filled.length === 1
          ? t('{route}: 1 Eintrag gespeichert', { route: route.name })
          : t('{route}: {n} Einträge gespeichert', { route: route.name, n: filled.length }),
      )
      close()
    } catch (error) {
      toastError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Field label={t('Route')}>
          <Input
            list={listId}
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
            placeholder="Route 201"
            required
            maxLength={60}
            autoFocus
          />
          <datalist id={listId}>
            {data.routes.map((r) => (
              <option key={r.id} value={r.name} />
            ))}
          </datalist>
        </Field>
        <Field label={t('Art')}>
          <div className="grid h-10 grid-cols-2 rounded-md border p-0.5">
            {(['wild', 'static'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn('rounded px-3 text-sm transition-colors', kind === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
              >
                {k === 'wild' ? t('Wild') : t('Static')}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <div className="grid gap-3">
        {data.players.map((player) => {
          const entry = entries[player.id]
          const already = existing.get(player.id)
          if (already) {
            const name = already.nickname ?? speciesName(species, already.species_id)
            return (
              <div key={player.id} className="flex items-center gap-3 rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
                <span className="size-2 rounded-full" style={{ background: player.color ?? 'var(--primary)' }} />
                <span className="font-medium text-foreground">{player.display_name}</span>
                <span className="ml-auto flex items-center gap-2">
                  <Sprite id={already.species_id} name={name} size="sm" state={already.state} idle={false} />
                  {name} · {t('schon eingetragen')}
                </span>
              </div>
            )
          }
          return (
            <div key={player.id} className="grid gap-2 rounded-xl border bg-background/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-medium">
                  <span className="size-2 rounded-full" style={{ background: player.color ?? 'var(--primary)' }} />
                  {player.display_name}
                </span>
                <div className="flex items-center gap-1 text-xs">
                  <button
                    type="button"
                    onClick={() => update(player.id, { missed: !entry.missed, speciesId: null })}
                    className={cn(
                      'label rounded border px-2 py-1 text-[0.6rem] transition-colors',
                      entry.missed ? 'border-destructive text-destructive' : 'text-muted-foreground',
                    )}
                  >
                    {t('Verpasst')}
                  </button>
                </div>
              </div>
              {entry.missed ? (
                <p className="flex h-14 items-center rounded-md border border-dashed px-3 text-sm text-muted-foreground">
                  {t('Begegnung verpasst – zählt bei {player}.', { player: player.display_name })}
                </p>
              ) : (
                <>
                  <SpeciesPicker index={species} value={entry.speciesId} onChange={(id) => update(player.id, { speciesId: id })} />
                  <DupeWarning speciesId={entry.speciesId} data={data} species={species} />
                </>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        {t('Team oder Box ergibt sich von selbst: ins Team, sobald alle Pokémon des Soul-Links da sind und jeder noch Platz hat.')}
      </p>
      <Button type="submit" size="lg" disabled={busy || filled.length === 0 || !routeName.trim()}>
        {busy ? t('Speichere …') : t('Speichern ({done}/{total})', { done: filled.length, total: open.length })}
      </Button>
    </form>
  )
}
