import { describe, expect, it } from 'vitest'
import { bestStab, effectiveness, pokewikiUrl } from '@/lib/dex'

// Typ-IDs wie in PokeAPI: 3 Flug, 5 Boden, 8 Geist, 9 Stahl, 10 Feuer, 12 Pflanze, 13 Elektro, 16 Drache, 18 Fee
describe('Typen-Tabelle', () => {
  it('multipliziert Doppeltypen', () => {
    expect(effectiveness(10, [12, 9], 4)).toBe(4)
    expect(effectiveness(13, [5, 3], 4)).toBe(0)
  })

  it('vor Gen 6 hält Stahl Geist ab, danach nicht mehr', () => {
    expect(effectiveness(8, [9], 4)).toBe(0.5)
    expect(effectiveness(8, [9], 6)).toBe(1)
  })

  it('Fee ist immun gegen Drache', () => {
    expect(effectiveness(16, [18], 6)).toBe(0)
  })

  it('bester gleichtypiger Treffer', () => {
    expect(bestStab([10, 3], [12], 4)).toBe(2)
  })
})

describe('PokéWiki-Link', () => {
  it('kodiert Leerzeichen und Sonderzeichen', () => {
    expect(pokewikiUrl('Mr. Mime')).toBe('https://www.pokewiki.de/Mr._Mime')
    expect(pokewikiUrl('Nidoran♀')).toBe('https://www.pokewiki.de/Nidoran%E2%99%80')
  })
})
