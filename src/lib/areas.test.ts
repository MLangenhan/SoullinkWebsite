import { describe, expect, it } from 'vitest'
import { HGSS } from '@/test/areaData'
import { encounter, event, member, route } from '@/test/fixtures'
import { areaKey, areaOverview } from '@/lib/areas'

describe('areaKey', () => {
  it('ignoriert Groß-/Kleinschreibung, Akzente, Leer- und Satzzeichen', () => {
    expect(areaKey('Knofensa Turm')).toBe(areaKey('Knofensa-Turm'))
    expect(areaKey('Mr. Pokémon')).toBe('mrpokemon')
    expect(areaKey('ROUTE 29')).toBe('route29')
  })
})

describe('areaOverview: offene Gebiete je Spieler', () => {
  const players = [member('A'), member('B')]
  const routes = [route('r-ilex', 'Ilex Forest'), route('r-viola', 'Viola City'), route('r-starter', 'Starter'), route('r-mr', 'Mr. Pokemon')]
  const encounters = [
    encounter('a1', 'A', 'L1', { route_id: 'r-ilex' }),
    encounter('b1', 'B', 'L1', { route_id: 'r-ilex' }),
    encounter('a2', 'A', 'L2', { route_id: 'r-viola' }),
    encounter('a3', 'A', 'L3', { route_id: 'r-starter' }),
    encounter('a4', 'A', 'L4', { route_id: 'r-mr', kind: 'static' }),
  ]
  const events = [event('encounter_missed', { member_id: 'B', route_id: 'r-viola', kind: 'wild' })]
  const overview = areaOverview(HGSS, players, routes, encounters, events)
  const find = (name: string, kind = 'wild') => overview.areas.find((a) => a.name === name && a.kind === kind)!

  it('ordnet Routen über den englischen Namen zu (Ilex Forest = Steineichenwald)', () => {
    expect(find('Steineichenwald')).toMatchObject({ done: true, routeIds: ['r-ilex'] })
  })

  it('gefangen oder verpasst zählt als erledigt, je Art getrennt', () => {
    expect(find('Viola City').players.map((p) => p.state)).toEqual(['caught', 'missed'])
    expect(find('Viola City').done).toBe(true)
    expect(find('Viola City', 'static')).toMatchObject({ done: false, started: false })
  })

  it('Orte ohne Eintrag sind offen und nicht angefangen', () => {
    expect(find('Route 29')).toMatchObject({ done: false, started: false })
    expect(overview.areas.some((a) => a.name === 'Dukatia City' && a.kind === 'wild')).toBe(false)
  })

  it('meldet Routen ohne passenden Ort, aber nicht den Starter', () => {
    expect(overview.unmatched.map((r) => r.name)).toEqual(['Mr. Pokemon'])
  })
})
