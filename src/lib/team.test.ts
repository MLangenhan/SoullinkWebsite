import { describe, expect, it } from 'vitest'
import { encounter, event } from '@/test/fixtures'
import { arrange, mirror, unsynced, TEAM_SIZE } from '@/lib/team'

const ids = (slots: ({ encounter_id: string } | null)[]) => slots.map((e) => e?.encounter_id ?? null)

describe('arrange: Team-Plätze wie im Spiel', () => {
  it('Fänge ins Team belegen die Plätze der Reihe nach', () => {
    const encounters = [encounter('a1', 'A', 'L1', { state: 'team' }), encounter('a2', 'A', 'L2', { state: 'team' })]
    const events = [event('encounter_logged', { encounter_id: 'a1', status: 'team' }), event('encounter_logged', { encounter_id: 'a2', status: 'team' })]
    expect(ids(arrange('A', encounters, events).slots)).toEqual(['a1', 'a2', null, null, null, null])
  })

  it('Box gibt den Platz frei, der nächste Fang nimmt den ersten freien Platz', () => {
    const encounters = [
      encounter('a1', 'A', 'L1', { state: 'team' }),
      encounter('a2', 'A', 'L2', { state: 'box' }),
      encounter('a3', 'A', 'L3', { state: 'team' }),
      encounter('a4', 'A', 'L4', { state: 'team' }),
    ]
    const events = [
      event('encounter_logged', { encounter_id: 'a1', status: 'team' }),
      event('encounter_logged', { encounter_id: 'a2', status: 'team' }),
      event('encounter_logged', { encounter_id: 'a3', status: 'team' }),
      event('encounter_status_changed', { encounter_id: 'a2', status: 'box' }),
      event('encounter_logged', { encounter_id: 'a4', status: 'team' }),
    ]
    const result = arrange('A', encounters, events)
    expect(ids(result.slots)).toEqual(['a1', 'a4', 'a3', null, null, null])
    expect(result.box.map((e) => e.encounter_id)).toEqual(['a2'])
  })

  it('Platzwechsel im Team tauscht mit dem bisherigen Inhaber', () => {
    const encounters = ['a1', 'a2', 'a3'].map((id, i) => encounter(id, 'A', 'L' + i, { state: 'team' }))
    const events = [
      ...['a1', 'a2', 'a3'].map((id) => event('encounter_logged', { encounter_id: id, status: 'team' })),
      event('encounter_status_changed', { encounter_id: 'a3', status: 'team', slot: 1 }),
    ]
    expect(ids(arrange('A', encounters, events).slots).slice(0, 3)).toEqual(['a3', 'a2', 'a1'])
  })

  it('rückgängig gemachte Ereignisse zählen nicht', () => {
    const encounters = [encounter('a1', 'A', 'L1', { state: 'team' }), encounter('a2', 'A', 'L2', { state: 'team' })]
    const swap = event('encounter_status_changed', { encounter_id: 'a2', status: 'team', slot: 1 })
    const events = [
      event('encounter_logged', { encounter_id: 'a1', status: 'team' }),
      event('encounter_logged', { encounter_id: 'a2', status: 'team' }),
      swap,
      event('event_reverted', { event_id: swap.id }),
    ]
    expect(ids(arrange('A', encounters, events).slots).slice(0, 2)).toEqual(['a1', 'a2'])
  })

  it('stirbt der Partner eines anderen Spielers, wird der eigene Platz frei', () => {
    const encounters = [
      encounter('a1', 'A', 'L1', { state: 'linked_dead' }),
      encounter('b1', 'B', 'L1', { state: 'dead' }),
      encounter('a2', 'A', 'L2', { state: 'team' }),
    ]
    const events = [
      event('encounter_logged', { encounter_id: 'a1', status: 'team' }),
      event('encounter_logged', { encounter_id: 'b1', status: 'team' }),
      event('encounter_logged', { encounter_id: 'a2', status: 'team' }),
      event('pokemon_died', { encounter_id: 'b1' }),
    ]
    expect(ids(arrange('A', encounters, events).slots)).toEqual([null, 'a2', null, null, null, null])
  })

  it('gleicht mit dem tatsächlichen Zustand ab, wenn Ereignisse fehlen (z. B. Altdaten)', () => {
    const encounters = [encounter('a1', 'A', 'L1', { state: 'team' })]
    expect(ids(arrange('A', encounters, []).slots)[0]).toBe('a1')
  })
})

describe('mirror: Teams angleichen', () => {
  const players = ['A', 'B']
  const name = () => 'Route'

  it('geht ein Pokémon in die Box, folgt der Partner; kommt eins ins Team, rückt der Partner auf den frei gewordenen Platz', () => {
    const encounters = [
      encounter('a1', 'A', 'L1', { state: 'team' }),
      encounter('b1', 'B', 'L1', { state: 'team' }),
      encounter('a2', 'A', 'L2', { state: 'box' }),
      encounter('b2', 'B', 'L2', { state: 'box' }),
    ]
    const events = [
      event('encounter_logged', { encounter_id: 'a1', status: 'team' }),
      event('encounter_logged', { encounter_id: 'b1', status: 'team' }),
    ]
    const [a1, , a2] = encounters
    const effects = mirror(
      [
        { encounter: a1, status: 'box' },
        { encounter: a2, status: 'team', slot: 1 },
      ],
      'A',
      players,
      encounters,
      events,
      name,
    )
    expect(effects).toHaveLength(1)
    expect(effects[0].memberId).toBe('B')
    expect(effects[0].out.map((m) => m.encounter.encounter_id)).toEqual(['b1'])
    expect(effects[0].in).toEqual([{ encounter: encounters[3], status: 'team', slot: 1 }])
  })

  it('meldet fehlende Partner und volle Teams, statt etwas zu erzwingen', () => {
    const teamOfB = Array.from({ length: TEAM_SIZE }, (_, i) => encounter('b' + i, 'B', 'T' + i, { state: 'team' }))
    const encounters = [
      ...teamOfB,
      encounter('a1', 'A', 'L1', { state: 'box' }),
      encounter('b-l1', 'B', 'L1', { state: 'box' }),
      encounter('a2', 'A', 'L2', { state: 'box' }),
    ]
    const effects = mirror(
      [
        { encounter: encounters[TEAM_SIZE], status: 'team' },
        { encounter: encounters[TEAM_SIZE + 2], status: 'team' },
      ],
      'A',
      players,
      encounters,
      [],
      () => 'Route 30',
    )
    expect(effects[0].in).toEqual([])
    expect(effects[0].notes).toEqual(['Team voll', 'kein Pokémon von Route 30'])
  })

  it('ein Platzwechsel ohne Zustandsänderung betrifft niemanden', () => {
    const a1 = encounter('a1', 'A', 'L1', { state: 'team' })
    expect(mirror([{ encounter: a1, status: 'team', slot: 3 }], 'A', players, [a1, encounter('b1', 'B', 'L1', { state: 'box' })], [], name)).toEqual([])
  })
})

describe('unsynced', () => {
  it('findet lebende Partner in anderem Zustand, nicht aber tote', () => {
    const a1 = encounter('a1', 'A', 'L1', { state: 'team' })
    const all = [a1, encounter('b1', 'B', 'L1', { state: 'box' }), encounter('c1', 'C', 'L1', { state: 'team' }), encounter('d1', 'D', 'L1', { state: 'dead' })]
    expect(unsynced(a1, all).map((e) => e.encounter_id)).toEqual(['b1'])
    expect(unsynced(all[3], all)).toEqual([])
  })
})
