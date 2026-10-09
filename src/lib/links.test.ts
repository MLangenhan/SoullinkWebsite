import { describe, expect, it } from 'vitest'
import { encounter, event, member } from '@/test/fixtures'
import { analyzeLinks, autoStatus, countLinks, missedKeys, hasMissed } from '@/lib/links'

const all = [member('A'), member('B'), member('C')]

describe('analyzeLinks: Vollständigkeit der Soul-Links', () => {
  it('ein Link ist vollständig, wenn jeder Spieler ein Pokémon darin hat', () => {
    const encounters = ['A', 'B', 'C'].map((m) => encounter('e' + m, m, 'L1'))
    expect(analyzeLinks(all, encounters, []).get('L1')).toMatchObject({ complete: true, missing: [], failed: false })
  })

  it('fehlt jemand, ist der Link unvollständig; hat er die Route verpasst, ist er verfallen', () => {
    const encounters = [encounter('eA', 'A', 'L1'), encounter('eB', 'B', 'L1')]
    expect(analyzeLinks(all, encounters, []).get('L1')).toMatchObject({ complete: false, missing: ['C'], failed: false })
    const missed = [event('encounter_missed', { member_id: 'C', route_id: 'r-L1', kind: 'wild' })]
    expect(analyzeLinks(all, encounters, missed).get('L1')).toMatchObject({ missed: ['C'], failed: true })
  })

  it('Paare: nur der Partner der eigenen Gruppe muss mitfangen', () => {
    const pairs = [member('A', { link_group: 1 }), member('B', { link_group: 1 }), member('C', { link_group: 2 }), member('D', { link_group: 2 })]
    const info = analyzeLinks(pairs, [encounter('eA', 'A', 'L1')], []).get('L1')
    expect(info?.required).toEqual(['A', 'B'])
    expect(info?.missing).toEqual(['B'])
  })

  it('verpasst gilt nur für die Art (wild/Static) und bis zum Undo', () => {
    const missed = event('encounter_missed', { member_id: 'C', route_id: 'r1', kind: 'static' })
    const keys = missedKeys([missed])
    expect(hasMissed(keys, 'C', 'r1', 'static')).toBe(true)
    expect(hasMissed(keys, 'C', 'r1', 'wild')).toBe(false)
    expect(missedKeys([missed, event('event_reverted', { event_id: missed.id })]).size).toBe(0)
  })
})

describe('autoStatus: Team oder Box beim Fang', () => {
  it('ins Team, wenn der Link damit vollständig ist und alle Platz haben; Partner aus der Box kommen mit', () => {
    const encounters = [encounter('eA', 'A', 'L1', { route_id: 'r1' }), encounter('eB', 'B', 'L1', { route_id: 'r1' })]
    const plan = autoStatus(all, encounters, 'r1', 'wild', ['C'])
    expect(plan.status.get('C')).toBe('team')
    expect(plan.promote.map((e) => e.encounter_id)).toEqual(['eA', 'eB'])
  })

  it('in die Box, solange der Link unvollständig ist', () => {
    const plan = autoStatus(all, [], null, 'wild', ['A'])
    expect(plan.status.get('A')).toBe('box')
    expect(plan.promote).toEqual([])
  })

  it('in die Box, wenn ein Beteiligter schon sechs im Team hat', () => {
    const full = Array.from({ length: 6 }, (_, i) => encounter('t' + i, 'A', 'T' + i, { state: 'team' }))
    const plan = autoStatus(all, full, null, 'wild', ['A', 'B', 'C'])
    expect(plan.status.get('A')).toBe('box')
  })
})

describe('countLinks: Kopfzeile zählt Soul-Links statt Pokémon', () => {
  it('alle verbunden: Pokémon geteilt durch Spieler', () => {
    const encounters = [
      ...['A', 'B', 'C'].map((m) => encounter('1' + m, m, 'L1', { state: 'team' })),
      ...['A', 'B', 'C'].map((m) => encounter('2' + m, m, 'L2', { state: 'box' })),
      encounter('3A', 'A', 'L3', { state: 'dead' }),
      encounter('3B', 'B', 'L3', { state: 'linked_dead' }),
      encounter('3C', 'C', 'L3', { state: 'linked_dead' }),
    ]
    expect(countLinks(encounters)).toEqual({ alive: 2, lost: 1 })
  })

  it('Paare: jedes Paar ist ein eigener Link', () => {
    const encounters = [encounter('1A', 'A', 'P1'), encounter('1B', 'B', 'P1'), encounter('1C', 'C', 'P2'), encounter('1D', 'D', 'P2')]
    expect(countLinks(encounters)).toEqual({ alive: 2, lost: 0 })
  })
})
