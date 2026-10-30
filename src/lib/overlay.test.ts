import { describe, expect, it } from 'vitest'
import { encounter, event, member } from '@/test/fixtures'
import {
  DEFAULT_CONFIG,
  latestLink,
  mergePayload,
  maskedOverlayUrl,
  overlayDeviceId,
  overlayUrl,
  parseConfig,
  serializeConfig,
  shownPlayers,
  teams,
  type OverlayConfig,
  type OverlayData,
} from '@/lib/overlay'

describe('Overlay-Einstellungen in der Adresse', () => {
  it('ohne Parameter gelten die Standardwerte', () => {
    expect(parseConfig('')).toEqual(DEFAULT_CONFIG)
  })

  it('Hin und zurück ergibt dieselben Einstellungen', () => {
    const config: OverlayConfig = {
      ...DEFAULT_CONFIG,
      widgets: ['cap', 'team', 'link'],
      seats: [2, 0],
      direction: 'row',
      align: 'end',
      theme: 'clear',
      accent: '#ff3366',
      scale: 150,
      names: false,
      titles: false,
      pokemonNames: false,
      nicknames: false,
      emptySlots: false,
      lang: 'en',
    }
    expect(parseConfig(serializeConfig(config))).toEqual({ ...config, seats: [0, 2] })
  })

  it('schreibt nur Abweichungen, damit der Link kurz bleibt', () => {
    expect(serializeConfig({ ...DEFAULT_CONFIG, widgets: ['link', 'cap'] })).toBe('w=link,cap')
  })

  it('verwirft Unbekanntes und begrenzt Werte', () => {
    const config = parseConfig('w=link,hack,link,team&p=1,x,-3,1&theme=neon&accent=red&scale=9999&dir=diagonal&lang=fr&names=vielleicht')
    expect(config.widgets).toEqual(['link', 'team'])
    expect(config.seats).toEqual([1])
    expect(config.theme).toBe('dark')
    expect(config.accent).toBe(DEFAULT_CONFIG.accent)
    expect(config.scale).toBe(250)
    expect(config.direction).toBe('column')
    expect(config.lang).toBe('de')
    expect(config.names).toBe(true)
  })

  it('Token steht im #-Teil, nie in der Abfrage', () => {
    const url = overlayUrl('https://x.github.io', '/SoullinkWebsite/', 'slo_abc', { ...DEFAULT_CONFIG, widgets: ['team'] })
    expect(url).toBe('https://x.github.io/SoullinkWebsite/obs?w=team#slo_abc')
  })

  it('verdeckte Adresse zeigt Einstellungen, aber nie den Schlüssel', () => {
    const masked = maskedOverlayUrl('https://x.github.io/obs?w=team,cap#slo_geheim123')
    expect(masked).toBe('https://x.github.io/obs?w=team,cap#slo_••••••••')
    expect(masked).not.toContain('geheim')
  })

  it('Geräte-ID ist zufällig, lang genug und bleibt gleich', () => {
    const id = overlayDeviceId()
    expect(id).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(overlayDeviceId()).toBe(id)
  })
})

describe('Overlay-Daten', () => {
  const moritz = member('M', { seat: 0, display_name: 'Moritz' })
  const janne = member('J', { seat: 1, display_name: 'Janne' })
  const gast = member('G', { role: 'viewer', seat: null })

  it('zeigt Spieler in Platz-Reihenfolge, ohne Zuschauer, auf Wunsch nur eine Auswahl', () => {
    expect(shownPlayers([janne, gast, moritz], []).map((m) => m.id)).toEqual(['M', 'J'])
    expect(shownPlayers([janne, gast, moritz], [1]).map((m) => m.id)).toEqual(['J'])
  })

  it('letzter Soul-Link: alle Pokémon der jüngsten Verbindung, Lücke für Spieler ohne Fang', () => {
    const encounters = [
      encounter('m1', 'M', 'L1'),
      encounter('j1', 'J', 'L1'),
      encounter('m2', 'M', 'L2', { species_id: 25 }),
    ]
    const link = latestLink(encounters, [moritz, janne])!
    expect(link.linkId).toBe('L2')
    expect(link.catches.map((c) => c.encounter?.encounter_id ?? null)).toEqual(['m2', null])
    expect(latestLink([], [moritz])).toBeNull()
  })

  it('Team je Spieler wie im Tab „Teams“', () => {
    const encounters = [encounter('m1', 'M', 'L1', { state: 'team' }), encounter('j1', 'J', 'L1', { state: 'box' })]
    const events = [
      event('encounter_logged', { encounter_id: 'm1', status: 'team' }),
      event('encounter_logged', { encounter_id: 'j1', status: 'box' }),
    ]
    const [m, j] = teams({ encounters, events }, [moritz, janne])
    expect(m.team[0]?.encounter_id).toBe('m1')
    expect(j.team.every((slot) => slot === null)).toBe(true)
  })

  it('unveränderte Antwort behält den bisherigen Stand', () => {
    const full = {
      version: 'v1',
      challenge: { id: 'c' },
      stats: { current_run: 1 },
      members: [],
      routes: [],
      encounters: [],
      events: [],
    } as unknown as OverlayData
    const first = mergePayload(null, full)!
    expect(mergePayload(first, { version: 'v1' })).toBe(first)
    expect(mergePayload(null, { version: 'v1' })).toBeNull()
    expect(mergePayload(first, { ...full, version: 'v2' })!.version).toBe('v2')
  })
})
