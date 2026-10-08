import { useEffect, useRef } from 'react'
import type { ChallengeData } from '@/hooks/useChallenge'
import { undoTeamChange } from '@/lib/actions'
import { speciesName, type Lookups } from '@/lib/describe'
import type { SpeciesIndex } from '@/lib/species'
import { toast, toastError } from '@/lib/toast'
import type { ChallengeEvent } from '@/lib/types'

/**
 * Hat jemand anderes einen Teamwechsel gemacht, der das eigene Team angleicht, erscheint ein Hinweis
 * mit dem, was man im Spiel nachziehen muss (und Rückgängig). Nur für Wechsel seit dem Öffnen der Seite.
 */
export function useTeamNotices(
  data: ChallengeData | null,
  lookups: Lookups,
  species: SpeciesIndex | null,
  refresh: (() => Promise<void>) | undefined,
) {
  // Letzte Ereignisnummer der Challenge beim ersten Laden; ältere Wechsel lösen keinen Hinweis aus
  const baseline = useRef<number | null>(null)
  const seen = useRef(new Set<string>())

  useEffect(() => {
    if (!data) return
    if (baseline.current === null) {
      baseline.current = data.challenge.last_seq
      return
    }
    const me = data.me
    if (!me || me.role === 'viewer') return

    const groups = new Map<string, ChallengeEvent[]>()
    for (const event of data.events) {
      const group = event.payload.group_id
      if (event.type !== 'encounter_status_changed' || typeof group !== 'string' || event.seq <= baseline.current) continue
      groups.set(group, [...(groups.get(group) ?? []), event])
    }

    for (const [group, events] of groups) {
      if (seen.current.has(group)) continue
      seen.current.add(group)
      if (events.some((e) => e.actor_member_id === me.id)) continue
      const mine = events
        .map((e) => ({ event: e, encounter: lookups.encounters.get(String(e.payload.encounter_id)) }))
        .filter((x) => x.encounter?.member_id === me.id)
        .sort((a, b) => (a.event.payload.status === 'team' ? -1 : 1) - (b.event.payload.status === 'team' ? -1 : 1))
      if (mine.length === 0) continue

      const actor = lookups.members.get(events[0].actor_member_id ?? '')?.display_name ?? 'Jemand'
      const parts = mine.map(({ event, encounter }) => {
        const name = encounter!.nickname ?? speciesName(species, encounter!.species_id)
        return event.payload.status === 'team'
          ? `${name} ins Team${typeof event.payload.slot === 'number' ? ` (Platz ${event.payload.slot})` : ''}`
          : `${name} in die Box`
      })
      toast(`${actor} hat das Team geändert. Bei dir: ${parts.join(', ')}. Bitte im Spiel nachziehen.`, 'info', {
        duration: 15000,
        action: {
          label: 'Rückgängig',
          run: () =>
            void undoTeamChange(data.challenge.id, group)
              .then(() => toast('Teamwechsel rückgängig gemacht'))
              .catch(toastError)
              .finally(() => void refresh?.()),
        },
      })
    }
  }, [data, lookups, species, refresh])
}
