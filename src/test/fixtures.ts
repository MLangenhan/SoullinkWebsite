import type { ChallengeEvent, Encounter, EncounterKind, Member, PokemonState, Route } from '@/lib/types'

// Kleine Fabriken für Testdaten: nur die Felder, auf die es im Test ankommt, der Rest hat Standardwerte

export function member(id: string, patch: Partial<Member> = {}): Member {
  return { id, challenge_id: 'c', role: 'player', display_name: id, color: null, seat: null, discord_id: null, link_group: null, ...patch }
}

export function route(id: string, name: string, sort = 0): Route {
  return { id, challenge_id: 'c', name, sort_order: sort }
}

let clock = 0
export function encounter(
  id: string,
  memberId: string,
  linkId: string,
  patch: Partial<Encounter> & { state?: PokemonState; kind?: EncounterKind } = {},
): Encounter {
  clock += 1
  return {
    challenge_id: 'c',
    run_number: 1,
    encounter_id: id,
    link_id: linkId,
    member_id: memberId,
    route_id: 'r-' + linkId,
    kind: 'wild',
    caught_species_id: 1,
    species_id: 1,
    nickname: null,
    state: 'box',
    lost_at: null,
    lost_with_encounter_id: null,
    death_event_id: null,
    death_route_id: null,
    death_cause: null,
    death_opponent: null,
    death_level: null,
    logged_at: new Date(Date.UTC(2026, 0, 1, 0, 0, clock)).toISOString(),
    event_id: clock,
    ...patch,
  }
}

let seq = 0
export function event(type: ChallengeEvent['type'], payload: Record<string, unknown>, id = ++seq): ChallengeEvent {
  return {
    id,
    challenge_id: 'c',
    seq: id,
    run_number: 1,
    type,
    payload,
    source: 'web',
    actor_member_id: null,
    actor_discord_id: null,
    reverts_event_id: null,
    occurred_at: new Date(Date.UTC(2026, 0, 1, 0, 0, id)).toISOString(),
  }
}
