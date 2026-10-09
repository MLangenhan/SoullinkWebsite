import { useState } from 'react'
import { Pokeball } from '@/components/Pokeball'
import { SpeciesPicker } from '@/components/SpeciesPicker'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { ChallengeData } from '@/hooks/useChallenge'
import { DupeWarning } from '@/components/challenge/DupeWarning'
import { appendEvent, changeTeam } from '@/lib/actions'
import { autoStatus } from '@/lib/links'
import { useT } from '@/lib/i18n'
import { speciesName } from '@/lib/describe'
import type { SpeciesIndex } from '@/lib/species'
import { toast, toastError } from '@/lib/toast'
import type { EncounterKind, Member, Route } from '@/lib/types'

export interface AddTarget {
  member: Member
  route: Route
  kind: EncounterKind
  /** Soul-Link der Zeile, zu dem der Spieler gehört (Paar oder alle); sonst wählt die Datenbank */
  linkId: string | null
}

/** Ein fehlendes Pokémon auf einer bestehenden Route nachtragen (oder als verpasst zählen). */
export function AddEncounterDialog({
  target,
  onOpenChange,
  data,
  species,
}: {
  target: AddTarget | null
  onOpenChange: (open: boolean) => void
  data: ChallengeData
  species: SpeciesIndex | null
}) {
  const t = useT()
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {target && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display tracking-tight text-3xl font-extrabold">{t('Nachtragen')}</DialogTitle>
              <DialogDescription>
                {t(target.kind === 'static' ? '{player} auf {route} (Static).' : '{player} auf {route}.', {
                  player: target.member.display_name,
                  route: target.route.name,
                })}{' '}
                {t('Das Pokémon kommt in den bestehenden Soul-Link.')}
              </DialogDescription>
            </DialogHeader>
            {species ? (
              <AddForm key={`${target.member.id}-${target.route.id}`} target={target} data={data} species={species} close={() => onOpenChange(false)} />
            ) : (
              <Pokeball className="py-8" />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function AddForm({ target, data, species, close }: { target: AddTarget; data: ChallengeData; species: SpeciesIndex; close: () => void }) {
  const t = useT()
  const [speciesId, setSpeciesId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  // Feste IDs pro geöffnetem Dialog: Erneutes Absenden nach einem Fehler erzeugt keine Duplikate
  const [ids] = useState(() => ({ encounter: crypto.randomUUID(), logged: crypto.randomUUID(), missed: crypto.randomUUID() }))

  const save = async (missed: boolean) => {
    setBusy(true)
    try {
      if (missed) {
        await appendEvent(
          data.challenge.id,
          'encounter_missed',
          { member_id: target.member.id, route_id: target.route.id, kind: target.kind },
          ids.missed,
        )
        toast(t('{player}: Begegnung auf {route} verpasst', { player: target.member.display_name, route: target.route.name }))
      } else if (speciesId !== null) {
        // Team, wenn der Soul-Link damit vollständig ist und alle Platz haben; die Partner kommen mit
        const plan = autoStatus(data.players, data.encounters, target.route.id, target.kind, [target.member.id])
        const status = plan.status.get(target.member.id) ?? 'box'
        await appendEvent(
          data.challenge.id,
          'encounter_logged',
          {
            encounter_id: ids.encounter,
            link_id: target.linkId,
            member_id: target.member.id,
            route_id: target.route.id,
            species_id: speciesId,
            kind: target.kind,
            status,
          },
          ids.logged,
        )
        if (plan.promote.length) {
          await changeTeam(
            data.challenge.id,
            crypto.randomUUID(),
            plan.promote.map((e) => ({ encounter_id: e.encounter_id, status: 'team' as const })),
          )
        }
        toast(t('{pokemon} für {player} nachgetragen', { pokemon: speciesName(species, speciesId), player: target.member.display_name }))
      }
      close()
    } catch (error) {
      toastError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4">
      <SpeciesPicker index={species} value={speciesId} onChange={setSpeciesId} autoFocus />
      <DupeWarning speciesId={speciesId} data={data} species={species} />
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button size="lg" disabled={busy || speciesId === null} onClick={() => void save(false)}>
          {busy ? t('Speichere …') : t('Nachtragen')}
        </Button>
        <Button size="lg" variant="outline" disabled={busy} onClick={() => void save(true)}>
          {t('Verpasst')}
        </Button>
      </div>
    </div>
  )
}
