import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/input'
import { SpeciesPicker } from '@/components/SpeciesPicker'
import { Pokeball } from '@/components/Pokeball'
import type { ChallengeData } from '@/hooks/useChallenge'
import { appendEvent, createRoute } from '@/lib/actions'
import type { SpeciesIndex } from '@/lib/species'
import { toast, toastError } from '@/lib/toast'
import type { EncounterKind, EncounterStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Entry {
  speciesId: number | null
  status: EncounterStatus
  missed: boolean
  /** Feste IDs pro geöffnetem Dialog: Erneutes Absenden nach einem Fehler erzeugt keine Duplikate */
  encounterId: string
  clientEventId: string
}

function freshEntries(data: ChallengeData): Record<string, Entry> {
  return Object.fromEntries(
    data.players.map((p) => [
      p.id,
      { speciesId: null, status: 'team', missed: false, encounterId: crypto.randomUUID(), clientEventId: crypto.randomUUID() },
    ]),
  )
}

/** Wie /add im Bot: eine Route, für jeden Spieler ein Pokémon (oder verpasst). Alle bilden einen Soul-Link. */
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-4xl font-black uppercase">Begegnung eintragen</DialogTitle>
          <DialogDescription>
            Alle Pokémon dieser Route bilden einen Soul-Link. Stirbt eins, sterben alle.
          </DialogDescription>
        </DialogHeader>
        {open && (species ? <LogForm data={data} species={species} close={() => onOpenChange(false)} /> : <Pokeball className="py-10" />)}
      </DialogContent>
    </Dialog>
  )
}

function LogForm({ data, species, close }: { data: ChallengeData; species: SpeciesIndex; close: () => void }) {
  const listId = useId()
  const [routeName, setRouteName] = useState('')
  const [kind, setKind] = useState<EncounterKind>('wild')
  const [entries, setEntries] = useState(() => freshEntries(data))
  const [linkId] = useState(() => crypto.randomUUID())
  const [busy, setBusy] = useState(false)

  const update = (memberId: string, patch: Partial<Entry>) =>
    setEntries((all) => ({ ...all, [memberId]: { ...all[memberId], ...patch } }))

  const filled = data.players.filter((p) => entries[p.id]?.speciesId !== null || entries[p.id]?.missed)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (filled.length === 0) return
    setBusy(true)
    try {
      const route = await createRoute(data.challenge.id, routeName)
      for (const player of data.players) {
        const entry = entries[player.id]
        if (entry.missed) {
          await appendEvent(data.challenge.id, 'encounter_missed', { member_id: player.id, route_id: route.id }, entry.clientEventId)
        } else if (entry.speciesId !== null) {
          await appendEvent(
            data.challenge.id,
            'encounter_logged',
            {
              encounter_id: entry.encounterId,
              link_id: linkId,
              member_id: player.id,
              route_id: route.id,
              species_id: entry.speciesId,
              kind,
              status: entry.status,
            },
            entry.clientEventId,
          )
        }
      }
      toast(`${route.name}: ${filled.length} ${filled.length === 1 ? 'Eintrag' : 'Einträge'} gespeichert`)
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
        <Field label="Route">
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
        <Field label="Art">
          <div className="grid h-10 grid-cols-2 rounded-md border p-0.5">
            {(['wild', 'static'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn('rounded px-3 text-sm transition-colors', kind === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
              >
                {k === 'wild' ? 'Wild' : 'Static'}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <div className="grid gap-3">
        {data.players.map((player) => {
          const entry = entries[player.id]
          return (
            <div key={player.id} className="grid gap-2 rounded-lg border bg-card/50 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-medium">
                  <span className="size-2 rounded-full" style={{ background: player.color ?? 'var(--primary)' }} />
                  {player.display_name}
                </span>
                <div className="flex items-center gap-1 text-xs">
                  {(['team', 'box'] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      disabled={entry.missed}
                      onClick={() => update(player.id, { status })}
                      className={cn(
                        'label rounded border px-2 py-1 text-[0.6rem] transition-colors disabled:opacity-40',
                        entry.status === status ? 'border-primary text-primary' : 'text-muted-foreground',
                      )}
                    >
                      {status === 'team' ? 'Team' : 'Box'}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => update(player.id, { missed: !entry.missed, speciesId: null })}
                    className={cn(
                      'label rounded border px-2 py-1 text-[0.6rem] transition-colors',
                      entry.missed ? 'border-destructive text-destructive' : 'text-muted-foreground',
                    )}
                  >
                    Verpasst
                  </button>
                </div>
              </div>
              {entry.missed ? (
                <p className="flex h-14 items-center rounded-md border border-dashed px-3 text-sm text-muted-foreground">
                  Begegnung verpasst – zählt bei {player.display_name}.
                </p>
              ) : (
                <SpeciesPicker index={species} value={entry.speciesId} onChange={(id) => update(player.id, { speciesId: id })} />
              )}
            </div>
          )
        })}
      </div>

      <Button type="submit" size="lg" disabled={busy || filled.length === 0 || !routeName.trim()}>
        {busy ? 'Speichere …' : `Speichern (${filled.length}/${data.players.length})`}
      </Button>
    </form>
  )
}
