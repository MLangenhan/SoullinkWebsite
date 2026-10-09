import { locale, t } from '@/lib/i18n'
import { speciesLabel, type SpeciesIndex } from '@/lib/species'
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
  const entry = species?.byId.get(id)
  return entry ? speciesLabel(entry) : `#${id}`
}

/** Ein Ereignis als Satz für die Timeline. */
export function describeEvent(
  event: ChallengeEvent,
  lookups: Lookups,
  species: SpeciesIndex | null,
  allEvents: ChallengeEvent[],
): Described {
  const p = event.payload
  const member = (id: unknown) => lookups.members.get(str(id) ?? '')?.display_name ?? t('Jemand')
  const route = (id: unknown) => lookups.routes.get(str(id) ?? '')?.name
  const encounter = lookups.encounters.get(str(p.encounter_id) ?? '')
  const owner = encounter ? member(encounter.member_id) : t('Jemand')

  switch (event.type) {
    case 'encounter_logged': {
      const vars = { name: member(p.member_id), species: speciesName(species, num(p.species_id)) }
      const routeName = route(p.route_id)
      const text = routeName
        ? t('{name} fängt {species} auf {route}', { ...vars, route: routeName })
        : t('{name} fängt {species} auf einer Route', vars)
      return {
        text: p.kind === 'static' ? `${text} (${t('Static')})` : text,
        speciesId: num(p.species_id),
        tone: 'catch',
      }
    }
    case 'encounter_missed':
      return {
        text: route(p.route_id)
          ? t('{name} verpasst die Begegnung auf {route}', { name: member(p.member_id), route: route(p.route_id)! })
          : t('{name} verpasst die Begegnung', { name: member(p.member_id) }),
        speciesId: null,
        tone: 'neutral',
      }
    case 'encounter_status_changed':
      return {
        text: t(p.status === 'team' ? '{owner}: {species} ins Team' : '{owner}: {species} in die Box', {
          owner,
          species: speciesName(species, encounter?.species_id),
        }),
        speciesId: encounter?.species_id ?? null,
        tone: 'neutral',
      }
    case 'encounter_evolved':
      return {
        text: t('{owner}: Entwicklung zu {species}', { owner, species: speciesName(species, num(p.species_id)) }),
        speciesId: num(p.species_id),
        tone: 'catch',
      }
    case 'encounter_corrected':
      return {
        text: t('{owner}: korrigiert zu {species}', { owner, species: speciesName(species, num(p.species_id)) }),
        speciesId: num(p.species_id),
        tone: 'neutral',
      }
    case 'pokemon_died': {
      const details = [
        str(p.cause),
        str(p.opponent) && t('gegen {opponent}', { opponent: str(p.opponent)! }),
        route(p.route_id) && t('auf {route}', { route: route(p.route_id)! }),
      ]
        .filter(Boolean)
        .join(', ')
      return {
        text: `${t('{owner}: {species} ist gestorben', { owner, species: speciesName(species, encounter?.species_id) })}${details ? ` (${details})` : ''}`,
        speciesId: encounter?.species_id ?? null,
        tone: 'death',
      }
    }
    case 'run_ended':
      return {
        text:
          p.result === 'won'
            ? t('Run {run} gewonnen!', { run: event.run_number })
            : `${t('Wipe: Run {run} ist vorbei', { run: event.run_number })}${p.caused_by_member_id ? ` (${member(p.caused_by_member_id)})` : ''}`,
        speciesId: null,
        tone: 'run',
      }
    case 'counter_adjusted': {
      const delta = num(p.delta) ?? 0
      const what = p.counter === 'deaths' ? t('Tode') : t('verpasste Begegnungen')
      return {
        text: `${member(p.member_id)}: ${what} ${delta > 0 ? '+' : ''}${delta}${str(p.note) ? ` (${str(p.note)})` : ''}`,
        speciesId: null,
        tone: 'neutral',
      }
    }
    case 'event_reverted': {
      const target = allEvents.find((e) => e.id === num(p.event_id))
      const inner = target ? describeEvent(target, lookups, species, allEvents).text : t('Ereignis #{id}', { id: String(p.event_id) })
      return { text: t('Rückgängig: {event}', { event: inner }), speciesId: null, tone: 'undo' }
    }
  }
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' })
}
