import type { SpeciesIndex } from '@/lib/species'
import type { ChallengeEvent, Encounter, Member, Route } from '@/lib/types'

export interface Lookups {
  members: Map<string, Member>
  routes: Map<string, Route>
  encounters: Map<string, Encounter>
}

export interface Described {
  text: string
  speciesId: number | null
  tone: 'catch' | 'death' | 'run' | 'neutral' | 'undo'
}

const str = (v: unknown) => (typeof v === 'string' ? v : null)
const num = (v: unknown) => (typeof v === 'number' ? v : null)

export function speciesName(species: SpeciesIndex | null, id: number | null | undefined) {
  if (id == null) return 'Pokémon'
  return species?.byId.get(id)?.name_de ?? `#${id}`
}

/** Ein Ereignis als Satz für die Timeline. */
export function describeEvent(
  event: ChallengeEvent,
  lookups: Lookups,
  species: SpeciesIndex | null,
  allEvents: ChallengeEvent[],
): Described {
  const p = event.payload
  const member = (id: unknown) => lookups.members.get(str(id) ?? '')?.display_name ?? 'Jemand'
  const route = (id: unknown) => lookups.routes.get(str(id) ?? '')?.name
  const encounter = lookups.encounters.get(str(p.encounter_id) ?? '')
  const owner = encounter ? member(encounter.member_id) : 'Jemand'

  switch (event.type) {
    case 'encounter_logged': {
      const kind = p.kind === 'static' ? ' (Static)' : ''
      return {
        text: `${member(p.member_id)} fängt ${speciesName(species, num(p.species_id))} auf ${route(p.route_id) ?? 'einer Route'}${kind}`,
        speciesId: num(p.species_id),
        tone: 'catch',
      }
    }
    case 'encounter_missed':
      return {
        text: `${member(p.member_id)} verpasst die Begegnung${route(p.route_id) ? ` auf ${route(p.route_id)}` : ''}`,
        speciesId: null,
        tone: 'neutral',
      }
    case 'encounter_status_changed':
      return {
        text: `${owner}: ${speciesName(species, encounter?.species_id)} ${p.status === 'team' ? 'ins Team' : 'in die Box'}`,
        speciesId: encounter?.species_id ?? null,
        tone: 'neutral',
      }
    case 'encounter_evolved':
      return {
        text: `${owner}: Entwicklung zu ${speciesName(species, num(p.species_id))}`,
        speciesId: num(p.species_id),
        tone: 'catch',
      }
    case 'pokemon_died': {
      const details = [str(p.cause), str(p.opponent) && `gegen ${str(p.opponent)}`, route(p.route_id) && `auf ${route(p.route_id)}`]
        .filter(Boolean)
        .join(', ')
      return {
        text: `${owner}: ${speciesName(species, encounter?.species_id)} ist gestorben${details ? ` (${details})` : ''}`,
        speciesId: encounter?.species_id ?? null,
        tone: 'death',
      }
    }
    case 'run_ended':
      return {
        text:
          p.result === 'won'
            ? `Run ${event.run_number} gewonnen!`
            : `Wipe: Run ${event.run_number} ist vorbei${p.caused_by_member_id ? ` (${member(p.caused_by_member_id)})` : ''}`,
        speciesId: null,
        tone: 'run',
      }
    case 'counter_adjusted': {
      const delta = num(p.delta) ?? 0
      const what = p.counter === 'deaths' ? 'Tode' : 'verpasste Begegnungen'
      return {
        text: `${member(p.member_id)}: ${what} ${delta > 0 ? '+' : ''}${delta}${str(p.note) ? ` (${str(p.note)})` : ''}`,
        speciesId: null,
        tone: 'neutral',
      }
    }
    case 'event_reverted': {
      const target = allEvents.find((e) => e.id === num(p.event_id))
      const inner = target ? describeEvent(target, lookups, species, allEvents).text : `Ereignis #${String(p.event_id)}`
      return { text: `Rückgängig: ${inner}`, speciesId: null, tone: 'undo' }
    }
  }
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
}
